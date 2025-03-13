import TelegramBot from "node-telegram-bot-api"
import { Logger } from "../libs/logger"
import axios from "axios"
// import { check } from "../libs/cloudflare"
// import { cfDB } from "../database/mongo"

export function setup(apiKey, logger: Logger) {
    const bot = new TelegramBot(apiKey, {
        polling: true
    })

    console.log("setup tg")

    bot.on("message", async (msg: TelegramBot.Message, meta: TelegramBot.Metadata) => {
        console.log(meta, msg)

        const {
            message_id,
            from: {
                id: tgId,
                first_name,
                username,
                language_code,
            },
            chat: {
                id: chatId,
                type
            },
            date,
            text,
            document
        } = msg

        if (meta.type == "document" && document.mime_type == "text/plain") {

            const {
                file_name,
                file_id
            } = document

            logger.log(`New Document ${file_name} ${file_id}`)

            const f = await bot.getFile(file_id)
            let fUrl = `https://api.telegram.org/file/bot${process.env.TG_KEY}/${f.file_path}`

            let doc = (await axios.get(fUrl)).data.split("\n").map(v => v.split(";").map(t => t.trim()))

            let bad = 0,
                ok = 0

            let msg = ""

            for (const a of doc) {
                logger.info("new acc")
                if (a.length < 7) {
                    bad++
                    msg += 'Bad keys count (email; password; apiKey; ns1; ns2; origin ca key; accId)\n'
                    logger.info('Bad keys count (email; password; apiKey; ns1; ns2; origin ca key; accId)')
                    continue
                }
                const email = a[0]
                const key = a[2]
                const id = a[6]

                let r = (await axios({
                    method: 'get',
                    headers: {
                        'X-Auth-Email': email,
                        'X-Auth-Key': key,
                    },
                    url: 'https://api.cloudflare.com/client/v4/accounts'
                })).data

                if (!r.success) {
                    bad++
                    msg += 'Bad email and/or apiKey\n'
                    logger.info('Bad email and/or apiKey')
                    continue
                }

                let f = false
                for (const _a of r.result) {
                    if (_a.id == id) {
                        f = true
                        break
                    }
                }

                if (!f) {
                    bad++
                    msg += 'Bad accId\n'
                    logger.info('Bad accId')
                    continue
                }

                ok++
                // cfDB.insertOne({
                //     email: email,
                //     apiKey: key,
                //     accId: id,
                // })
            }

            bot.sendMessage(chatId, `Ok accs: ${ok}\nBad accs: ${bad}\n Errs: ${msg}`)

            return
        }


        bot.sendMessage(chatId, text)
    })
}