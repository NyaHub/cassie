import crypto from "node:crypto"
import fs from "node:fs"
import basex from "./libs/basex"
import axios from "axios"

export const APIKEYLEAD = "K"
export const ZERO_KEY = APIKEYLEAD + "00000000000000000000000000000000-00000000000000000000000000000000"

export function sha256(str): Buffer {
    return crypto.createHash("sha256").update(str).digest()
}

export function createToken(): string {
    return sha256(crypto.randomBytes(32)).toString("hex").replace(/(.{16})(.{16})(.{16})(.{16})/, "$1-$2-$3-$4")
}

export function createApiKey(): string {
    return sha256(crypto.randomBytes(32)).toString("hex").replace(/(.{32})(.{32})/, APIKEYLEAD + "$1-$2")
}

export function createPromo(): string {
    return crypto.randomBytes(16).toString("hex")
}

export function createPk(): string {
    return sha256(crypto.randomBytes(32)).toString("hex")
}

export async function getOurIp() {
    return (await axios({
        url: "http://ifconfig.me",
        family: 4,
        method: "GET"
    })).data
}

function randSym(): string {
    let byte = crypto.randomInt(256)
    let char = String.fromCharCode(byte)
    while (!char.match(/[a-zA-Z0-9]/)) {
        byte = crypto.randomInt(256)
        char = String.fromCharCode(byte)
    }
    return char
}

export function genPassword(len: number): string {
    return (new Array(len).fill(0)).map(() => randSym()).join("")
}

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
export const base58 = basex(ALPHABET)

/**
 * Format bytes as human-readable text.
 * 
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use 
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 * 
 * @return Formatted string.
 */
export function humanFileSize(bytes: number, si: boolean = false, dp: number = 1): string {
    const thresh = si ? 1000 : 1024;

    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }

    const units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10 ** dp;

    do {
        bytes /= thresh;
        ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);


    return bytes.toFixed(dp) + ' ' + units[u];
}


/**
 * 
 * Get or create .env vars
 * 
 * @param envKey Key of env variable in config
 * @param cfgPath Path to config
 * @param createFunction Function for creating new value
 * @returns value from config or new value
 */
export function getOrCreateCFGVar<T>(envKey: string, cfgPath: string, createFunction: () => T): string | T {
    let v: any = process.env[envKey]
    if (!v) {
        v = createFunction()
        const cfgString = `${envKey}=${v}`
        if (!fs.existsSync(cfgPath)) {
            fs.writeFileSync(cfgPath, cfgString)
        } else {
            let f = false
            let cfg = fs.readFileSync(cfgPath).toString("utf-8").split("\n").map(e => {
                if (!e.trim()) return

                let t = e.trim().split("=")
                if (t.length > 0 && t[0] === envKey) {
                    t[1] = v
                    f = true
                }
                return t.join("=")
            }).filter(e => e)

            if (!f) {
                cfg.push(cfgString)
            }
            fs.writeFileSync("./.env", cfg.join("\n"))
        }
    }
    return v
}


export function* createChunkStream(arr: any[], chunkL: number = 100): Generator<any[]> {

    let chCount = Math.ceil(arr.length / chunkL)

    for (let i = 0; i < chCount; i++) {
        yield arr.slice(i * chunkL, (i + 1) * chunkL)
    }
}