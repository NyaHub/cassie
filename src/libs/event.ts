export class Event {
    protected events = {}

    public on(event: string, listener: (sock: any, data: any) => void) {
        if (!this.events[event]) {
            this.events[event] = [listener]
        } else {
            this.events[event].push(listener)
        }
    }
    public emit(event: string, sock: any, data: any) {
        if (!this.events[event]) return
        this.events[event].forEach(element => {
            element(sock, data)
        });
    }
}
