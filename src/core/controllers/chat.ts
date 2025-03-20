import EventEmitter from "events";
import { Message, MessagePreset, Ticket, User } from "../../database";
import { IntError } from "../../routes/api";
import { Op } from "sequelize";
import { Allowance, IMessage, ITicket } from "../../types";
import { db2interface } from "../../type.conv";

export class ChatCtrl {
    private bus: EventEmitter

    constructor(bus: EventEmitter) {
        this.bus = bus
    }

    async sendMesage(ticketId: string, message: string, content: any, user: User) {
        let u = await User.findByPk(user.id)
        if (!u) throw new IntError("User not found!")

        let ticket = await Ticket.findByPk(ticketId)

        if (!ticket) throw new IntError("Ticket not found!")

        let msg = await Message.create({
            message,
            content,
            TicketId: ticketId,
            FromId: user.id
        })

        await Message.update({ readed: true }, {
            where: {
                TicketId: ticketId,
                FromId: {
                    [Op.ne]: user.id
                }
            }
        })

        this.bus.emit("msgRead", {
            data: `${user.id}:${ticketId}`,
            channels: [`support:${user.Domain.OwnerId}`, `ticket:${ticketId}`]
        })
        this.bus.emit("newMessage", {
            data: msg.dataValues,
            channels: [`support:${user.Domain.OwnerId}`, `ticket:${ticketId}`]
        })

        return true
    }
    async getMessages(ticketId: string): Promise<IMessage[]> {
        return (await Message.findAll({ where: { TicketId: ticketId } })).map(e => db2interface.message(e))
    }
    async setReaded(ticketId: string, user: User) {
        await Message.update({ readed: true }, {
            where: {
                TicketId: ticketId,
                FromId: {
                    [Op.ne]: user.id
                }
            }
        })
        this.bus.emit("msgRead", {
            data: user.id,
            channels: [`support:${user.Domain.OwnerId}`, `ticket:${ticketId}`]
        })
        return true
    }

    async createTicket(description: string, user: User): Promise<ITicket> {

        if (!user) throw new IntError("User not found!")

        let tick = await Ticket.count({ where: { UserId: user.id } })

        if (user.allowance > Allowance.Manager && tick > 0) throw new IntError("Пошел нахуй, одного хватит!")

        return db2interface.ticket(await Ticket.create({
            description,
            UserId: user.id,
            AdminId: user.Domain?.OwnerId
        }))
    }
    async getTickets(page: number, per_page: number, user: User): Promise<{
        tickets: ITicket[],
        count: number
        pages: number
    }> {

        let limit = per_page || 50
        let offset = (page || 0) * limit

        let opts = {
            limit,
            offset,
            include: [
            ]
        }

        switch (user.allowance) {
            case Allowance.System:
            case Allowance.Owner: {
                let max = await Ticket.count()
                let tickets = (await Ticket.findAll(opts)).map(e => db2interface.ticket(e))

                return {
                    tickets,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Admin: {
                let max = await Ticket.count({ where: { AdminId: user.id } })
                let tickets = (await Ticket.findAll({ where: { AdminId: user.id }, ...opts })).map(e => db2interface.ticket(e))
                return {
                    tickets,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            case Allowance.Manager: {
                let max = await Ticket.count({ where: { AdminId: user.Domain.OwnerId } })
                let tickets = (await Ticket.findAll({ where: { AdminId: user.Domain.OwnerId }, ...opts })).map(e => db2interface.ticket(e))
                return {
                    tickets,
                    count: max,
                    pages: Math.ceil(max / limit)
                }
            }
            default: throw new IntError("Low Allowance!")
        }
    }
    async getMyTickets(page: number, per_page: number, user: User) {

        let limit = per_page || 50
        let offset = (page || 0) * limit

        let opts = {
            limit,
            offset,
            include: [
            ]
        }
        let max = await Ticket.count({ where: { UserId: user.id } })
        let tickets = (await Ticket.findAll({ where: { UserId: user.id }, ...opts })).map(e => db2interface.ticket(e))
        return {
            tickets,
            count: max,
            pages: Math.ceil(max / limit)
        }
    }

    async createPreset(text: string, title: string, user: User) {
        let ownerId = user.allowance === Allowance.Admin ? user.id : user.Domain.OwnerId

        if (!text && !title) throw new IntError("Text or title required!")

        text ? text = title : 0;
        title ? title = `${text.slice(0, 16)}...` : 0;

        let preset = await MessagePreset.create({
            text,
            title,
            OwnerId: ownerId
        })

        return db2interface.messagepreset(preset)
    }
    async editPreset(id: string, text: string, title: string, user: User) {
        let ownerId = user.allowance === Allowance.Admin ? user.id : user.Domain.OwnerId

        let preset = await MessagePreset.findOne({
            where: { id, OwnerId: ownerId }
        })

        if (!preset) throw new IntError("Preset not found!")

        text ? preset.text = text : 0;
        title ? preset.title = title : 0;

        return db2interface.messagepreset(await preset.save())
    }
    async getPresets(user: User) {
        let ownerId = user.allowance === Allowance.Admin ? user.id : user.Domain.OwnerId

        return (await MessagePreset.findAll({
            where: { OwnerId: ownerId }
        })).map(e => db2interface.messagepreset(e))
    }
    async deletePreset(id: string, user: User) {
        let ownerId = user.allowance === Allowance.Admin ? user.id : user.Domain.OwnerId
        return !!await MessagePreset.destroy({ where: { id, OwnerId: ownerId } })
    }
}