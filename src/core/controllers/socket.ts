import EventEmitter from "node:events"
import { Server } from "node:http"
import { Server as SServer } from "socket.io"
import { AuthRequest } from "../../libs/session"
import { NextFunction, Response } from "express"
import { Domain } from "../../database"

export interface AuthSockRequest extends AuthRequest {
    req: { id: string; status: 0; domain: string; nsList: any[]; zoneId: string; name: string; gameOptions: string; gameBotOptions: string; chatBotOptions: string; Users: any[]; Account: any; AccountId: any; createdAt: Date; updatedAt: Date }
    io: SServer,
    bus: EventEmitter,
    Domain: Domain
}

export function initSocket(bus: EventEmitter, server: Server) {
    const sockServer = new SServer(server, {
        path: '/api/v1/socket',
        cors: { origin: "*" }
    })

    bus.on('newMessage', (data) => {
        sockServer.emit('newMessage', data)
    })
    bus.on('newDeposit', (data) => {
        sockServer.emit('newDeposit', data)
    })

    bus.on('withdrawCompleted', (e) => {
        sockServer.emit('withdrawCompleted', e)
    })
    bus.on('faucetEmpty', (e) => {
        sockServer.emit('faucetEmpty', e)
    })
    bus.on('no_for_fee_on_native', (e) => {
        sockServer.emit('no_for_fee_on_native', e)
    })

    return (req: AuthSockRequest, res: Response, next: NextFunction) => {
        req.io = sockServer
        req.bus = bus
        next()
    }
}