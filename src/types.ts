import { ZERO_ID, ZERO_KEY } from "./utils"



// types

export type Balance = { val: number, usd: number }

// enums

export enum NetType {
    ETH,
    BTC,
    MATIC,
    TRX,
    BNB,
    BSC,
    TRON
}
export const NetTypeNames = [
    "ETH",
    "BTC",
    "MATIC",
    "TRX",
    "BNB",
    "BSC"
]
export enum Allowance {
    System = -1, // системный уровень, на всякий случай, логин через форму тут зарежем
    // логин для системного юзера/ов будет только по токену
    Owner, // владелец площадки
    Admin, // арендатор
    Manager, // работники площадки со стороны арендатора
    User, // пользователи
    Guest, // гости
    Banned // забаненые юзеры
    // если забаненый залогинится, то его кинет на страничку ошибки
    // у остальных такого не будет, ну тут логична причина
}
export enum DomainStatus {
    initializing,
    pending,
    active,
}
export enum UTxTypes {
    Bet,
    Win,
    Deposit,
    Withdraw,
    PromoActivate
}
export enum UTxStatus {
    pending,
    accepted,
    declined
}

// interfaces

export interface IAddress {
    id: string,
    addr: string
}
export interface IUser {
    id: string
    email: string
    username: string
    allowance: Allowance
    balances: { [key: string]: Balance }
    apitoken: string
    bannedAt?: boolean

    ref: string // код который даем приглашенным
    referals?: IUser[]
    refCount?: number
    refCode: string // код который чел активировал

    Domain: string
    Sitename: string

    Tickets?: ITicket[]

    Txs?: IUTx[]

    Activated?: IPromo
    PromoId?: string

    createdAt?: Date
}
export interface IPromo {
    id: string
    promo: string
    value: number
    currency: string

    Activations: IUser[]

    DomainId?: string

    WorkerId?: string

    createdAt: Date
}
export interface IDomain {
    id: string
    status: DomainStatus
    domain: string
    nsList?: string[]
    name: string
    gameOptions?: any
    gameBotOptions?: any
    chatBotOptions?: any

    createdAt: Date
}
export interface ICFAcc {
    id: string
    email: string
    apiKey: string
    accountId: string

    Domains?: IDomain[]

    createdAt: Date
}
export interface IFile {
    id: string
    originalname: string
    mimetype: string
    path: string
    size: number

    createdAt: Date
}
export interface IMessagePreset {
    id: string
    text: string
    title: string

    createdAt: Date
}
export interface IUTx {
    id: string
    value: number
    usd: number
    currency: string // usdt|eth|btc ... etc. ...
    description: string
    type: UTxTypes
    status: UTxStatus

    UserId: string

    AdminId?: string

    WorkerId?: string

    createdAt: Date
}
export interface IMessage {
    id: string
    message: string
    content: any
    readed: boolean

    TicketId: string

    FromId: string

    createdAt: Date
}
export interface ITicket {
    id: string
    description: string

    User?: IUser
    UserId: string

    createdAt: Date
}
export interface IUserEdit {
    username?: string,
    email?: string,
    password?: string,
}
// consts

export const DefaultUser = {
    id: ZERO_ID,
    email: "",
    username: "",
    allowance: Allowance.Guest,
    balances: {},
    apitoken: ZERO_KEY,
    password: "",
    bannedAt: new Date(),
    ref: "000000000000",

    referals: [],
    refCode: "",

    Domains: [],
    Domain: null,
    DomainId: null,

    Tickets: [],
    Messages: [],

    Txs: [],

    AdminPromos: [],
    Promos: [],

    Activated: null,
    PromoId: "",

    createdAt: new Date(),
}