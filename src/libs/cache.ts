import fs from "node:fs"

export type JSONable = string | number | Object
export type Key = string | number
export type path = string


export class FSCache {
    private cache: Object
    private file: string
    constructor(file: path) {

        if (!fs.existsSync(file)) {
            this.cache = {}
        } else {
            this.cache = JSON.parse(fs.readFileSync(file, "utf-8"))
        }
        this.file = file

    }
    private save() {
        fs.writeFileSync(this.file, JSON.stringify(this.cache))
    }
    get(key: Key): any {
        if (typeof this.cache === "object" && !this.cache.hasOwnProperty(key)) return null
        if (["number", "string"].includes(typeof this.cache)) return this.cache
        return this.cache[key]
    }
    set(key: Key, val: JSONable) {
        this.cache[key] = val
        this.save()
    }
    getA() {
        return this.cache
    }
}

export const Faucets = new FSCache('./faucets.json')