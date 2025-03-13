import { createWriteStream, WriteStream } from "fs"
import { join } from "path"
import { NextFunction, Request, Response } from "express"

export type LoggerConf = {
    loglevel: number,
    transport: LoggerTransport[]
}
enum LogLevel {
    FATAL,
    ERROR,
    WARN,
    INFO,
    DEBUG,
    TRACE,
}
const LogLevelS = [
    "FATAL",
    "ERROR",
    "WARN",
    "INFO",
    "DEBUG",
    "TRACE",
]
const LogLevelColors = [
    [34, 41],
    [31, 39],
    [33, 39],
    [37, 39],
    [37, 39],
    [31, 43],
]

function mb(num) {
    return Math.floor(num / (1 << 20));
}

abstract class LoggerTransport {
    constructor() { }
    abstract write(str: string, to: "out" | "err"): void
}
export class CLITransport extends LoggerTransport {
    public write(str: string | Uint8Array, to: string): void {
        switch (to) {
            case "out":
                process.stdout.write(str)
                break
            case "err":
                process.stderr.write(str)
                break
        }
    }
}
export class FileTransport extends LoggerTransport {
    private fname: string
    private out: WriteStream
    private err: WriteStream
    private outBuf: string[] = []
    private errBuf: string[] = []
    private outTimer: NodeJS.Timeout = null
    private errTimer: NodeJS.Timeout = null
    constructor(path: string = "./", fname: string = "_log.txt") {
        super()
        this.fname = fname
        this.out = createWriteStream(join(path, `access${fname}`), {
            'flags': 'a',
            'encoding': 'utf-8',
            'mode': 0o666
        })
        this.err = createWriteStream(join(path, `error${fname}`), {
            'flags': 'a',
            'encoding': 'utf-8',
            'mode': 0o666
        })
    }

    private clearColors(msg: string) {
        msg = msg.replace('\x1b[0m', '')
        for (const v of LogLevelColors) {
            msg = msg.replaceAll(`\x1b[${v[0]}m`, '').replaceAll(`\x1b[${v[1]}m`, '')
        }
        return msg
    }
    public write(str: string, to: "out" | "err"): void {
        str = this.clearColors(str)

        const interval = 1000

        const errWrite = () => {
            if (this.errTimer === null) {
                this.errTimer = setTimeout(() => {
                    this.err.write(this.errBuf.join(""))
                    this.errTimer = null
                    this.errBuf.length = 0
                }, interval)
            }
            this.errBuf.push(str)
        }
        const stdWrite = () => {
            if (this.outTimer === null) {
                this.outTimer = setTimeout(() => {
                    this.out.write(this.outBuf.join(""))
                    this.outTimer = null
                    this.outBuf.length = 0
                }, interval)
            }
            this.outBuf.push(str)
        }

        switch (to) {
            case "out":
                stdWrite()
                break
            case "err":
                errWrite()
                break
        }
    }
}

export class Logger {
    private conf: LoggerConf
    private _module: string = ""
    private loglevel: number

    constructor(conf: LoggerConf, _module: string = "") {
        this.loglevel = conf.loglevel || 0
        this._module = _module
        this.conf = conf;
        (this.conf.transport.length > 0 ? 0 : (this.conf.transport = [new CLITransport()]))
    }

    private write(str: string, to: "out" | "err"): void {
        this.conf.transport.forEach(tr => {
            tr.write(str + "\n", to)
        })
    }
    private get time(): string {
        let time = new Date()
        return `${time.getFullYear()}/${time.getMonth() + 1}/${time.getDate()} - ${time.getHours()}:${time.getMinutes()}:${time.getSeconds()}.${time.getMilliseconds()}`.padEnd(25, " ")
    }
    private createLogString(level: LogLevel, msg: string): string {
        if (this._module) {
            return `[${this.time}] [${LogLevelS[level]}] [${this._module}]: ${msg}`
        } else {
            return `[${this.time}] [${LogLevelS[level]}]: ${msg}`
        }
    }
    private _log(level: LogLevel, ...args: string[]): void {
        if (!(this.loglevel >= level)) return
        const msg = args.join(" ")
        const stream = [LogLevel.ERROR, LogLevel.FATAL].includes(level) ? "err" : "out"
        const colors = LogLevelColors[level]
        const t = `\x1b[${colors[0]}m${this.createLogString(level, msg)}\x1b[${colors[1]}m\x1b[0m`
        this.write(t, stream)
    }
    private _custom(level: LogLevel, msg: string) {
        if (!(this.loglevel >= level)) return
        const stream = [LogLevel.ERROR, LogLevel.FATAL].includes(level) ? "err" : "out"
        const colors = LogLevelColors[level]
        msg = `\x1b[${colors[0]}m\x1b[${colors[1]}m${msg}\x1b[0m`
        this.write(msg, stream)
    }

    public fat(...args: string[]): void {
        this._log(LogLevel.FATAL, ...args)
    }
    public err(...args: string[]): void {
        this._log(LogLevel.ERROR, ...args)
    }
    public warn(...args: string[]): void {
        this._log(LogLevel.WARN, ...args)
    }
    public info(...args: string[]): void {
        this._log(LogLevel.INFO, ...args)
    }
    public log(...args: any[]): void { // yep its duplicate function info

        const msg = args.map((v, i, a) => JSON.stringify(v, null, "    ")).join("")

        this._log(LogLevel.INFO, msg)
    }
    public debug(...args: string[]): void {
        this._log(LogLevel.DEBUG, ...args)
    }
    public trace(...args: string[]): void {
        this._log(LogLevel.TRACE, ...args)
    }

    public getLogger(_module: string) {
        return new Logger(this.conf, _module)
    }

    public memory() {
        const mem = Logger.memoryUsage();

        this.info(`Memory: rss=${mem.total}mb, js-heap=${mem.jsHeap}/${mem.jsHeapTotal}mb native-heap=${mem.nativeHeap}mb`);
    }

    public getMiddleware() {
        return (function (req: Request, res: Response, next: NextFunction) {
            const method = req.method
            const url = req.url
            const ip = req.ip || undefined

            res.on('finish', () => {
                const status = res.statusCode;
                if (status >= 400) {
                    this._custom(LogLevel.ERROR, `[${this.time}] [${LogLevelS[LogLevel.ERROR]}] [Express.js] : ${ip}: ${method} ${status} ${url}`)
                } else {
                    this._custom(LogLevel.INFO, `[${this.time}] [${LogLevelS[LogLevel.ERROR]}] [Express.js]: ${ip}: ${method} ${status} ${url}`)
                }
            })

            next()
        }).bind(this)
    }

    static memoryUsage() {
        if (!process.memoryUsage) {
            return {
                total: 0,
                jsHeap: 0,
                jsHeapTotal: 0,
                nativeHeap: 0,
                external: 0
            };
        }

        const mem = process.memoryUsage();

        return {
            total: mb(mem.rss),
            jsHeap: mb(mem.heapUsed),
            jsHeapTotal: mb(mem.heapTotal),
            nativeHeap: mb(mem.rss - mem.heapTotal),
            external: mb(mem.external)
        };
    }
}
