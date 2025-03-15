import { NextFunction, Request, Response } from "express"
import { APIKEYLEAD, sha256 } from "../utils"
import { Logger } from "./logger"
import { Domain, Promo, Ticket, User } from "../database/index"
import { AuthSockRequest } from "../core/controllers/socket"
import { DefaultUser } from "../types"

let getPublicKey, verify, sign

type Bytes = Uint8Array;

import("@noble/secp256k1").then(mod => {
    getPublicKey = mod.getPublicKey
    verify = mod.verify
    sign = mod.signAsync
})


export interface AuthRequest extends Request {
    session: Session
}

interface JWTdata {
    uuid: string
}

export class Session {
    private privateKey: Buffer
    private publicKey: Bytes
    public name: string = "session"
    public errors: string[] = []
    private _data: JWTdata
    public res: Response
    public isAuth: boolean = false
    private authToken: string = ""
    public cUser: User

    get authtoken() {
        return this.authToken
    }

    get data() {
        return this._data
    }

    async setData(v: JWTdata) {
        this._data = v
        this.isAuth = true
        await this.sign()
    }



    constructor(pk: string, name: string) {
        if (!pk) {
            throw Error("No private key for session")
        }

        this.name = name

        this.privateKey = Buffer.from(pk, "hex")
        this.publicKey = getPublicKey(this.privateKey)
    }

    async sign() {
        const data = Buffer.from(JSON.stringify(this._data)).toString("base64")
        const hash = sha256(JSON.stringify(this._data))
        let sig = Buffer.from((await sign(hash, this.privateKey)).toCompactRawBytes()).toString("base64")
        this.authToken = `${data}.${sig}`
        this.res.cookie(this.name, this.authToken)
    }

    async verify(token: string): Promise<boolean> {
        let [data, sig] = token.split(".").map(e => Buffer.from(e, "base64"))
        const hash = sha256(data)
        try {
            await verify(sig.toString("hex"), hash, this.publicKey)
            this._data = JSON.parse(data.toString())
            return true
        } catch (e) {
            return false
        }
    }
}
export function session(pk: string, name: string, logger: Logger) {
    return async function express(req: AuthSockRequest, res: Response, next: NextFunction) {

        const sess = new Session(pk, name)

        sess.res = res

        req.session = sess

        const token: string = req?.body?.authToken || req.cookies[name] || req.headers["authorization"]

        logger.info("Session token", token)

        const include = {
            include: [
                { model: Domain, as: "Domain" },
                { model: Promo, as: "Activated" },
                { model: User, as: "referals" },
                { model: Ticket, as: "Tickets" }
            ]
        }

        if (token && token[0] == APIKEYLEAD) {
            let u
            try {
                u = (await User.findOne({
                    where: {
                        apitoken: token,
                        DomainId: req.Domain.id
                    },
                    ...include
                })).dataValues
            } catch (error) {
                sess.cUser = User.build(DefaultUser)
                logger.err(error.message)
            }

            if (!u) {
                sess.cUser = User.build(DefaultUser)
                return next()
            }

            sess.cUser = u
            sess.isAuth = true

            return next()
        }

        if (!token || !await sess.verify(token)) {

            sess.cUser = User.build(DefaultUser)
            return next()
        }

        try {
            let u = await User.findByPk(sess.data.uuid, include)
            if (!u) {
                sess.cUser = User.build(DefaultUser)
                return next()
            }
            sess.cUser = u
            sess.isAuth = true
        } catch (error) {
            sess.cUser = User.build(DefaultUser)
            logger.err(error.message)
        }

        next()
    }
}

export function socketSession(pk: string, name: string, logger: Logger) {
    return async (socket, next) => {

        const token: string = socket.handshake.auth.token
        const domain: string = socket.handshake.headers.host.split(":")[0]

        let dom = await Domain.findOne({
            where: {
                domain
            }
        })

        if (!dom) return next(new Error(""))

        if (!token) return next(new Error("fucking beach"))

        const sess = new Session(pk, name)

        sess.res = socket

        socket.session = sess
        socket.Domain = dom

        logger.info("Session token", token)

        if (token && token[0] == APIKEYLEAD) {
            let u
            try {
                u = (await User.findOne({
                    where: {
                        apitoken: token,
                        DomainId: dom.id
                    },
                    include: [
                        { model: Domain, as: "Domain" }
                    ]
                })).dataValues
            } catch (error) {
                sess.cUser = User.build(DefaultUser)
                logger.err(error.message)
            }

            if (!u) {
                sess.cUser = User.build(DefaultUser)
                return next()
            }

            sess.cUser = u
            sess.isAuth = true

            return next()
        }

        if (!token || !await sess.verify(token)) {

            sess.cUser = User.build(DefaultUser)
            return next()
        }

        try {
            let u = await User.findByPk(sess.data.uuid, {
                include: [
                    { model: Domain, as: "Domain" }
                ]
            })
            if (!u) {
                sess.cUser = User.build(DefaultUser)
                return next()
            }
            sess.cUser = u
            sess.isAuth = true
        } catch (error) {
            sess.cUser = User.build(DefaultUser)
            logger.err(error.message)
        }

        next()
    }
}