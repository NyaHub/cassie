import EventEmitter from "node:events"
import { Server } from "node:http"
import { Socket, Server as SServer } from "socket.io"
import { AuthRequest, session, Session, socketSession } from "../../libs/session"
import { NextFunction, Response } from "express"
import { Domain, Ticket } from "../../database"
import { Logger } from "../../libs/logger"
import { Allowance } from "../../types"
import { Cache, RedisCache } from "../../libs/cache"

export interface AuthSockRequest extends AuthRequest {
    req: { id: string; status: 0; domain: string; nsList: any[]; zoneId: string; name: string; gameOptions: string; gameBotOptions: string; chatBotOptions: string; Users: any[]; Account: any; AccountId: any; createdAt: Date; updatedAt: Date }
    io: SServer,
    bus: EventEmitter,
    Domain: Domain
}

const channels = {
    /*userid*/                                            // self subscribe by user id automatically
    /*all*/                 all: Allowance.Guest,         // public events
    /*support:adminid*/     support: Allowance.Manager,   // events for workers (support messages and mb etc.)
    /*admin:adminid*/       admin: Allowance.Admin,       // events for admin, not equal self channel
    /*system*/              system: Allowance.System,     // служебные сообщения, а такого юзера только руками создать можно
    /*ticket:ticketid*/     ticket: Allowance.User        // ticket updates for user
}

export function initSocket(bus: EventEmitter, server: Server, logger: Logger, hueta: { name: string, pk: string }, cache: RedisCache | Cache) {
    const sockServer = new SServer(server, {
        path: '/api/v1/socket',
        cors: { origin: "*" }
    })

    function reply(event, defaultCH: string = "system") {
        bus.on(event, (data: { data: any, channels: string[] }) => {
            if (!data.channels?.length) {
                data.channels = [defaultCH]
            }
            for (let ch of data.channels) {
                sockServer.to(ch.toLowerCase()).emit(event, data.data)
            }
        })
    }

    sockServer.use(socketSession(hueta.pk, hueta.name, logger.getLogger("socket session"), cache))

    reply("newMessage") // support, ticket
    reply("msgRead") // support, ticket
    reply("newBalance") // userid
    reply("newDeposit") // admin, system
    // reply("withdrawCompleted") // admin, system
    // reply("faucetEmpty") // system
    // reply("no_for_fee_on_native") // system

    sockServer.on("connection", (socket: Socket & { session: Session, Domain: Domain }) => {
        logger.info(`User connected: ${socket.session.cUser.id} (${Allowance[socket.session.cUser.allowance]})`);
        socket.join(socket.session.cUser.id)
        socket.join("all")

        socket.on('subscribe', async (group: string) => {
            group = group.toLowerCase()
            let id
            let grp = group

            if (group.includes(":")) {
                let [_grp, _id, ..._] = group.split(":")
                id = _id
                grp = _grp
            }

            if (channels[grp] && channels[grp] > socket.session.cUser.allowance) {
                switch (grp) {
                    case "support":
                        if (socket.Domain.OwnerId != id) {
                            return
                        }
                        break
                    case "admin":
                        if (socket.session.cUser.id != id) {
                            return
                        }
                        break
                    case "ticket":
                        let tic = await Ticket.findByPk(id)
                        if (!(tic && tic.UserId === socket.session.cUser.id)) {
                            return
                        }
                }
                socket.join(group)
            }
        })

        socket.on('disconnect', () => {
            logger.info(`User disconnected: ${socket.session.cUser.id}`)
        })
    })

    return {
        sockMidl: (req: AuthSockRequest, res: Response, next: NextFunction) => {
            req.io = sockServer
            req.bus = bus
            next()
        },
        sockRoute: (req: AuthSockRequest, res: Response, next: NextFunction) => {
            res.send({
                channels: [
                    "all",
                    ...(req.session.isAuth ? [req.session.cUser.id, 'ticket:$ticketId'] : null),
                    req.session.cUser.allowance < Allowance.User ? `support:${req.session.cUser.Domain.OwnerId}` : null,
                    req.session.cUser.allowance < Allowance.Admin ? `admin:${req.session.cUser.id}` : null,
                ].filter(e => e)
            })
        }
    }
}
