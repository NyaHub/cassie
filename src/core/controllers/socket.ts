import EventEmitter from "node:events"
import { Server } from "node:http"
import { Socket, Server as SServer } from "socket.io"
import { AuthRequest, Session, socketSession } from "../../libs/session"
import { NextFunction, Response } from "express"
import { Domain } from "../../database"
import { Logger } from "../../libs/logger"
import { Allowance } from "../../types"

export interface AuthSockRequest extends AuthRequest {
    req: { id: string; status: 0; domain: string; nsList: any[]; zoneId: string; name: string; gameOptions: string; gameBotOptions: string; chatBotOptions: string; Users: any[]; Account: any; AccountId: any; createdAt: Date; updatedAt: Date }
    io: SServer,
    bus: EventEmitter,
    Domain: Domain
}

export function initSocket(bus: EventEmitter, server: Server, logger: Logger, hueta: { name: string, pk: string }) {
    const sockServer = new SServer(server, {
        path: '/api/v1/socket',
        cors: { origin: "*" }
    })

    function reply(event) {
        bus.on(event, (data: { data: any, channel: string }) => {
            sockServer.to(data.channel).emit(event, data.data)
        })
    }

    sockServer.use(socketSession(hueta.pk, hueta.name, logger.getLogger("socket session")))

    reply("newMessage")
    reply("msgRead")
    reply("newBalance")

    sockServer.on("connection", (socket: Socket & { session: Session, Domain: Domain }) => {
        logger.info(`User connected: ${socket.session.cUser.id} (${Allowance[socket.session.cUser.allowance]})`);

        socket.on('subscribe', (group: string) => {
            console.log(group)
            socket.join(group)
        })

        // Отключение
        socket.on('disconnect', () => {
            logger.info(`User disconnected: ${socket.session.cUser.id}`)
        })
    })

    // io.use((socket, next) => {
    //     const token = socket.handshake.auth.token;

    //     if (!token) {
    //         return next(new Error('Token is required'));
    //     }

    //     try {
    //         // Декодируем токен из base64
    //         const decoded = Buffer.from(token, 'base64').toString('utf-8');
    //         const payload = JSON.parse(decoded);

    //         // Проверяем наличие обязательных полей
    //         if (!payload.id || !payload.role || !payload.name) {
    //             return next(new Error('Invalid token'));
    //         }

    //         // Сохраняем пользователя
    //         users[payload.id] = payload;
    //         socket.user = payload;
    //         next();
    //     } catch (error) {
    //         return next(new Error('Invalid token'));
    //     }
    // })

    // bus.on('newMessage', (data) => {
    //     sockServer.emit('newMessage', data)
    // })
    // bus.on('newDeposit', (data) => {
    //     sockServer.emit('newDeposit', data)
    // })

    // bus.on('withdrawCompleted', (e) => {
    //     sockServer.emit('withdrawCompleted', e)
    // })
    // bus.on('faucetEmpty', (e) => {
    //     sockServer.emit('faucetEmpty', e)
    // })
    // bus.on('no_for_fee_on_native', (e) => {
    //     sockServer.emit('no_for_fee_on_native', e)
    // })

    return (req: AuthSockRequest, res: Response, next: NextFunction) => {
        req.io = sockServer
        req.bus = bus
        next()
    }
}

// {
//     // In-memory хранилище сообщений
//     const messages: Message[] = [];

//     // In-memory хранилище пользователей
//     const users: { [key: string]: User } = {};

//     // Middleware для авторизации
//     io.use((socket, next) => {
//         const token = socket.handshake.auth.token;

//         if (!token) {
//             return next(new Error('Token is required'));
//         }

//         try {
//             // Декодируем токен из base64
//             const decoded = Buffer.from(token, 'base64').toString('utf-8');
//             const payload = JSON.parse(decoded);

//             // Проверяем наличие обязательных полей
//             if (!payload.id || !payload.role || !payload.name) {
//                 return next(new Error('Invalid token'));
//             }

//             // Сохраняем пользователя
//             users[payload.id] = payload;
//             socket.user = payload;
//             next();
//         } catch (error) {
//             return next(new Error('Invalid token'));
//         }
//     });

//     // Обработка подключения
//     io.on('connection', (socket: Socket & { user: User }) => {
//         console.log(`User connected: ${socket.user.name} (${socket.user.role})`);

//         // Отправка сообщения
//         socket.on('sendMessage', (content: string, event: string, target?: string) => {
//             const message: Message = {
//                 id: Date.now().toString(),
//                 sender: socket.user,
//                 content,
//                 timestamp: Date.now(),
//                 event,
//                 target,
//             };

//             // Сохраняем сообщение
//             messages.push(message);

//             // Отправляем сообщение в зависимости от типа события
//             switch (event) {
//                 case 'all':
//                     // Всем пользователям
//                     io.emit('message', message);
//                     break;
//                 case 'group':
//                     // Всем пользователям в группе
//                     if (target) {
//                         io.to(target).emit('message', message);
//                     }
//                     break;
//                 case 'user':
//                     // Конкретному пользователю
//                     if (target) {
//                         io.to(target).emit('message', message);
//                     }
//                     break;
//                 default:
//                     break;
//             }
//         });

//         // Подписка на группу
//         socket.on('subscribe', (group: string) => {
//             socket.join(group);
//             console.log(`User ${socket.user.name} subscribed to group ${group}`);
//         });

//         // Отключение
//         socket.on('disconnect', () => {
//             console.log(`User disconnected: ${socket.user.name}`);
//             delete users[socket.user.id];
//         });
//     });

//     // Запуск сервера
//     const PORT = 3000;
//     server.listen(PORT, () => {
//         console.log(`Server is running on http://localhost:${PORT}`);
//     });
// }