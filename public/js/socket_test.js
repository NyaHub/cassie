// Подключение к серверу по пути /api/v1/socket
const socket = io('http://localhost:3000', {
    path: '/api/v1/socket', // Указываем путь
    auth: {
        token: 'K0c4b31a4110362a884adb9004636f65f-8bca5d58aec946cd2db37d3456896013' // Токен для авторизации
        // кста, для авторизации можно юзать как apitoken юзера так и куку session
    }
});

// Элементы DOM
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');

// Обработка входящих сообщений
socket.on('newMessage', (data) => {
    // const messageElement = document.createElement('div');
    // messageElement.textContent = `${message.sender.name}: ${message.content}`;
    // messagesDiv.appendChild(messageElement);
    console.log(data)
});
socket.on('msgRead', (data) => {
    // const messageElement = document.createElement('div');
    // messageElement.textContent = `${message.sender.name}: ${message.content}`;
    // messagesDiv.appendChild(messageElement);
    console.log(data)
})

// req({
//     url: "/api/v1/send",
//     method: "post",
//     headers: {
//         "Content-type": "application/json"
//     },
//     params: JSON.stringify({

//     })
// })

// Отправка сообщения
sendButton.addEventListener('click', () => {
    const content = messageInput.value;
    if (content) {
        req({
            url: "/api/v1/chat/send",
            method: "post",
            headers: {
                "Content-type": "application/json"
            },
            params: JSON.stringify({
                ticketId: "bae63976-c55a-402c-bb9b-b83736e8da25",
                message: content,
                content: { hui: "dadadadadadadadada" },
            })
        })
        messageInput.value = ''; // Очищаем поле ввода
    }
})

// Подписка на группу
socket.emit('subscribe', 'support')

/*
отправить (авточтение)
post: "/chat/send", Allowance.User
    body: {
        ticketId: string
        message: string
        content: any // загадочное поле, сюда пхай что хочешь что поместится в json, причем можешь прямо объектами (уууу, аттач файлов, реплай сообщений...)
    }
    response: true

прочитать все что выше в истории (только сообщения собеседника)
post: "/chat/read", Allowance.User
    body: {
        ticketId: string
    }
    response: true

получить список сообщений
get: "/chat/:ticId", Allowance.Manager
    response: IMessage[]

получить все тикеты #paging
get: "/ticket/all", Allowance.Manager
    response: ITicket[]

тоже, но только те что сам создал #paging
get: "/ticket/my", Allowance.User
    response: ITicket[]

создать тикет
post: "/ticket/", Allowance.User
    body: {
        description?: string // мб пригодится
    }
    response: ITicket[]

какие есть события по чату
да их есть 2
    newMessage - новое сообщение, летит само сообщение
    msgRead - просто летит инфо о том что собеседник прочитал сообщения, из данных id собеседника
а еще есть 2 канала их получения
    1 канал support
    2 канал по id тикета
пока разграничения по правам тут нет, но не злоупотреблять этим, чуть позже завезу
да и support канал полезен только админам/тпшерам
*/