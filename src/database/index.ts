import { Sequelize, DataTypes, Model, ForeignKey, NonAttribute, CreationOptional } from "sequelize";
import bcrypt from "bcrypt"
import { Logger } from "../libs/logger";
import { createApiKey, createPromo } from "../utils";
import { Allowance, Balance, DomainStatus, UTxTypes, UTxStatus } from "../types";

export let sequelize: Sequelize = null
export class Wallet extends Model {
    declare id: CreationOptional<string>
    declare privateKey: string
    declare uhash: string

    declare Addrs: NonAttribute<Addr>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export class Addr extends Model {
    declare id: CreationOptional<string>
    declare addr: string
    declare used: boolean
    declare coin: string

    declare wallet: NonAttribute<Wallet>
    declare WalletId: ForeignKey<Wallet["id"]>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export class Tx extends Model {
    declare id: CreationOptional<string>
    declare txhash: string
    declare value: string
    declare ok: boolean
    declare to: string
    declare currency: string
    declare height: number

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export class User extends Model {
    declare id: CreationOptional<string>
    declare email: string
    declare username: string
    declare allowance: Allowance
    declare balances: { [key: string]: Balance }
    declare apitoken: string
    declare password: string
    declare bannedAt: Date
    declare ref: string

    declare referals: NonAttribute<User[]>
    declare refCode: ForeignKey<User["ref"]>

    declare Domains: NonAttribute<Domain[]>
    declare Domain: NonAttribute<Domain>
    declare DomainId: ForeignKey<Domain["id"]>

    declare Tickets: NonAttribute<Ticket[]>
    declare Messages: NonAttribute<Message[]>

    declare Txs: NonAttribute<UTx[]>

    declare AdminPromos: NonAttribute<Promo[]>
    declare Promos: NonAttribute<Promo[]>

    declare Activated: NonAttribute<Promo>
    declare PromoId: ForeignKey<Promo["id"]>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export class Promo extends Model {
    declare id: CreationOptional<string>
    declare promo: string
    declare value: number
    declare currency: string

    declare Activations: NonAttribute<User[]>

    declare Domain: NonAttribute<Domain>
    declare DomainId: ForeignKey<Domain["id"]>

    declare Admin: NonAttribute<User>
    declare AdminId: ForeignKey<User["id"]>

    declare Worker: NonAttribute<User>
    declare WorkerId: ForeignKey<User["id"]>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export class Domain extends Model {
    declare id: CreationOptional<string>
    declare status: DomainStatus
    declare domain: string
    declare nsList: string[]
    declare zoneId: string
    declare name: string
    declare gameOptions: any
    declare gameBotOptions: any
    declare chatBotOptions: any

    declare Owner: NonAttribute<User>
    declare OwnerId: ForeignKey<User["id"]>

    declare Promos: NonAttribute<Promo[]>
    declare Users: NonAttribute<User[]>
    declare Account: NonAttribute<CFAcc>
    declare AccountId: ForeignKey<CFAcc["id"]>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}
export class CFAcc extends Model {
    declare id: CreationOptional<string>
    declare email: string
    declare password: string
    declare apiKey: string
    declare accountId: string
    declare count: number

    declare Domains: NonAttribute<Domain[]>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export class File extends Model {
    declare id: CreationOptional<string>
    declare originalname: string
    declare mimetype: string
    declare path: string
    declare size: number

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export class MessagePreset extends Model {
    declare id: CreationOptional<string>
    declare text: string
    declare title: string

    declare Owner: NonAttribute<User>
    declare OwnerId: ForeignKey<User["id"]>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
}
export class UTx extends Model {
    declare id: CreationOptional<string>
    declare value: number
    declare usd: number
    declare currency: string // usdt|eth|btc ... etc. ...
    declare description: string
    declare type: UTxTypes
    declare status: UTxStatus

    declare User: NonAttribute<User>
    declare UserId: ForeignKey<User["id"]>

    declare Admin: NonAttribute<User>
    declare AdminId: ForeignKey<User["id"]>

    declare Worker: NonAttribute<User>
    declare WorkerId: ForeignKey<User["id"]>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export class Message extends Model {
    declare id: CreationOptional<string>
    declare message: string
    declare content: any
    declare readed: boolean

    declare Ticket: NonAttribute<Ticket>
    declare TicketId: ForeignKey<Ticket["id"]>

    declare From: NonAttribute<User>
    declare FromId: ForeignKey<User["id"]>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export class Ticket extends Model {
    declare id: CreationOptional<string>
    declare description: string

    declare Messages: NonAttribute<Message[]>

    declare User: NonAttribute<User>
    declare UserId: ForeignKey<User["id"]>

    declare Admin: NonAttribute<User>
    declare AdminId: ForeignKey<User["id"]>

    declare createdAt: CreationOptional<Date>
    declare updatedAt: CreationOptional<Date>
    declare deletedAt: CreationOptional<Date>
}
export function initdb(logger: Logger) {
    sequelize = new Sequelize({
        storage: "./db.sqlite",
        dialect: "sqlite",
        logging: (msg) => logger.trace(msg)
    })

    let seqParanoid = { sequelize, paranoid: true }
    let seqNormal = { sequelize, paranoid: false }
    const seqID = {
        type: DataTypes.UUID,
        unique: true,
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    }

    Wallet.init({
        id: seqID,
        privateKey: DataTypes.STRING,
        uhash: DataTypes.STRING
    }, seqParanoid)
    Addr.init({
        id: seqID,
        addr: DataTypes.STRING,
        used: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },
        coin: DataTypes.STRING
    }, seqParanoid)
    Tx.init({
        id: seqID,
        txhash: DataTypes.STRING,
        value: DataTypes.STRING,
        ok: DataTypes.BOOLEAN,
        to: DataTypes.STRING,
        currency: DataTypes.STRING,
        height: DataTypes.INTEGER
    }, seqParanoid)

    User.init({
        id: seqID,
        username: {
            type: DataTypes.STRING,
            allowNull: false
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
            set(v: string) {
                this.setDataValue('password', bcrypt.hashSync(v, 10))
            }
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false
        },
        allowance: {
            type: DataTypes.INTEGER,
            defaultValue: Allowance.User
        },
        bannedAt: {
            type: DataTypes.DATE,
            defaultValue: null
        },
        balances: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        apitoken: {
            type: DataTypes.STRING,
            defaultValue: createApiKey
        },
        ref: {
            type: DataTypes.STRING,
            unique: true,
            defaultValue: () => crypto.randomUUID().split("-")[4]
        }
    }, seqParanoid)

    Promo.init({
        id: seqID,
        promo: {
            type: DataTypes.STRING,
            defaultValue: createPromo
        },
        value: {
            type: DataTypes.STRING,
            defaultValue: Math.floor(Math.random() * 100)
        },
        currency: {
            type: DataTypes.STRING,
            defaultValue: 'USDT'
        }
    }, seqParanoid)

    UTx.init({
        id: seqID,
        value: DataTypes.FLOAT,
        usd: DataTypes.FLOAT,
        currency: DataTypes.STRING,
        description: DataTypes.STRING,
        type: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        status: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
    }, seqParanoid)

    Domain.init({
        id: seqID,
        status: DataTypes.INTEGER,
        domain: DataTypes.STRING,
        nsList: {
            type: DataTypes.JSON,
            defaultValue: []
        },
        zoneId: DataTypes.STRING,
        name: DataTypes.STRING,
        gameOptions: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        gameBotOptions: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        chatBotOptions: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
    }, seqNormal)
    CFAcc.init({
        id: seqID,
        email: DataTypes.STRING,
        password: DataTypes.STRING,
        apiKey: DataTypes.STRING,
        accountId: DataTypes.STRING,
    }, seqParanoid)

    File.init({
        id: seqID,
        originalname: DataTypes.STRING,
        mimetype: DataTypes.STRING,
        path: DataTypes.STRING,
        size: DataTypes.INTEGER
    }, seqParanoid)
    MessagePreset.init({
        id: seqID,
        text: DataTypes.STRING,
        title: DataTypes.STRING
    }, seqNormal)

    Message.init({
        id: seqID,
        message: DataTypes.TEXT,
        content: {
            type: DataTypes.JSON,
            defaultValue: {}
        },
        readed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, seqParanoid)
    Ticket.init({
        id: seqID,
        description: DataTypes.STRING
    }, seqParanoid)

    Ticket.hasMany(Message, { foreignKey: "TicketId", as: "Messages" })
    Message.belongsTo(Ticket, { foreignKey: "TicketId", as: "Ticket" })

    User.hasMany(Message, { foreignKey: "FromId", as: "Messages" })
    Message.belongsTo(User, { foreignKey: "FromId", as: "From" })

    User.hasMany(Ticket, { foreignKey: "UserId", as: "Tickets" })
    Ticket.belongsTo(User, { foreignKey: "UserId", as: "User" })

    User.hasMany(Ticket, { foreignKey: "AdminId", as: "AdminTickets" })
    Ticket.belongsTo(User, { foreignKey: "AdminId", as: "Admin" })

    Wallet.hasMany(Addr)
    Addr.belongsTo(Wallet)

    User.hasMany(Promo, { foreignKey: "WorkerId", as: "Promos" })
    Promo.belongsTo(User, { foreignKey: "WorkerId", as: "Worker" })

    Promo.hasMany(User, { foreignKey: "PromoId", as: "Activations" })
    User.belongsTo(Promo, { foreignKey: "PromoId", as: "Activated" })

    CFAcc.hasMany(Domain, { foreignKey: "AccountId", as: "Domains" })
    Domain.belongsTo(CFAcc, { foreignKey: "AccountId", as: "Account" })

    Domain.hasMany(User, { foreignKey: "DomainId", as: "Users" })
    User.belongsTo(Domain, { foreignKey: "DomainId", as: "Domain" })

    Domain.hasMany(Promo, { foreignKey: "DomainId", as: "Promos" })
    Promo.belongsTo(Domain, { foreignKey: "DomainId", as: "Domain" })

    User.hasMany(Promo, { foreignKey: "AdminId", as: "AdminPromos" })
    Promo.belongsTo(User, { foreignKey: "AdminId", as: "Admin" })

    User.hasMany(Domain, { foreignKey: "OwnerId", as: "Domains" })
    Domain.belongsTo(User, { foreignKey: "OwnerId", as: "Owner" })

    User.hasMany(UTx, { foreignKey: "UserId", as: "Txs" })
    UTx.belongsTo(User, { foreignKey: "UserId", as: "User" })

    User.hasMany(UTx, { foreignKey: "AdminId", as: "AdminTxs" })
    UTx.belongsTo(User, { foreignKey: "AdminId", as: "Admin" })

    User.hasMany(UTx, { foreignKey: "WorkerId", as: "WorkerTxs" })
    UTx.belongsTo(User, { foreignKey: "WorkerId", as: "Worker" })

    User.hasMany(MessagePreset, { foreignKey: "OwnerId", as: "Presets" })
    MessagePreset.belongsTo(User, { foreignKey: "OwnerId", as: "Owner" })

    User.hasMany(User, { foreignKey: "refCode" })
    User.belongsTo(User, { foreignKey: "refCode", as: "referals", targetKey: "ref" })
}