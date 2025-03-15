import { CFAcc, Domain, Message, MessagePreset, Promo, Ticket, User, UTx, File } from "./database"
import { ICFAcc, IDomain, IFile, IMessage, IMessagePreset, IPromo, ITicket, IUser, IUTx } from "./types"

export const db2interface = {

    user(u: User, admin: boolean = true): IUser {
        if (!u) return null
        return {
            id: u.id,
            email: u.email,
            username: u.username,
            allowance: u.allowance,
            balances: u.balances,
            apitoken: u.apitoken,
            bannedAt: !!u.bannedAt,

            ref: u.ref,
            referals: admin ? u.referals?.map(e => db2interface.user(e, admin)) : null,
            refCount: u.referals?.length || 0,
            refCode: u.refCode,

            Domain: u.Domain?.domain,
            Sitename: u.Domain?.name,

            Tickets: u.Tickets?.map(e => db2interface.ticket(e, admin)),

            Txs: u.Txs?.map(e => db2interface.utx(e, admin)),

            Activated: admin ? db2interface.promo(u.Activated, admin) : null,
            PromoId: u.PromoId,

            createdAt: u.createdAt,
        }
    },
    ticket(t: Ticket, admin: boolean = true): ITicket {
        if (!t) return null
        return {
            id: t.id,
            description: t.description,

            User: admin ? db2interface.user(t.User, admin) : null,
            UserId: t.UserId,

            createdAt: t.createdAt,
        }
    },
    promo(P: Promo, admin: boolean = true): IPromo {
        if (!P) return null
        return {
            id: P.id,
            promo: P.promo,
            value: P.value,
            currency: P.currency,

            Activations: P.Activations?.map(e => db2interface.user(e, admin)),

            DomainId: P.DomainId,

            WorkerId: P.WorkerId,

            createdAt: P.createdAt,
        }
    },
    domain(D: Domain, admin: boolean = true): IDomain {
        if (!D) return null
        return {
            id: D.id,
            status: D.status,
            domain: D.domain,
            nsList: D.nsList,
            name: D.name,

            gameOptions: D.gameOptions,
            gameBotOptions: D.gameBotOptions,
            chatBotOptions: D.chatBotOptions,

            createdAt: D.createdAt,
        }
    },
    cfacc(C: CFAcc, admin: boolean = true): ICFAcc {
        if (!C) return null
        return {
            id: C.id,
            email: C.email,
            apiKey: C.apiKey,
            accountId: C.accountId,

            Domains: C.Domains?.map(e => db2interface.domain(e, admin)),

            createdAt: C.createdAt,
        }
    },
    file(F: File, admin: boolean = true): IFile {
        if (!F) return null
        return {
            id: F.id,
            originalname: F.originalname,
            mimetype: F.mimetype,
            path: F.path,
            size: F.size,

            createdAt: F.createdAt,
        }
    },
    messagepreset(M: MessagePreset, admin: boolean = true): IMessagePreset {
        if (!M) return null
        return {
            id: M.id,
            text: M.text,
            title: M.title,

            createdAt: M.createdAt,
        }
    },
    utx(U: UTx, admin: boolean = true): IUTx {
        if (!U) return null
        return {
            id: U.id,
            value: U.value,
            usd: U.usd,
            currency: U.currency,
            description: U.description,
            type: U.type,
            status: U.status,

            UserId: U.UserId,
            WorkerId: U.WorkerId,

            createdAt: U.createdAt,
        }
    },
    message(M: Message, admin: boolean = true): IMessage {
        if (!M) return null
        return {
            id: M.id,
            message: M.message,
            content: M.content,
            readed: M.readed,

            TicketId: M.TicketId,

            FromId: M.FromId,

            createdAt: M.createdAt,
        }
    }
}