import fs from "node:fs"
import path from 'path'
import { createClient, RedisClientType } from 'redis'
import { rootpath } from "../root"

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

export class Cache {
    private cache: Map<string, { value: any; expiresAt?: number }> = new Map()

    public set(key: string, value: any, ttl?: number): void {
        const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined
        this.cache.set(key, { value, expiresAt })
    }

    public get(key: string): any | null {
        const entry = this.cache.get(key)
        if (!entry) return null

        if (entry.expiresAt && entry.expiresAt < Date.now()) {
            this.cache.delete(key)
            return null
        }

        return entry.value
    }

    public del(key: string): void {
        this.cache.delete(key)
    }

    public expire(key: string, ttl: number): boolean {
        const entry = this.cache.get(key)
        if (!entry) return false

        entry.expiresAt = Date.now() + ttl * 1000
        return true
    }

    public flush(): void {
        this.cache.clear()
    }

    public keys() {
        return this.cache.keys()
    }
}

export class RFSCache {
    private cache: Map<string, { value: any; expiresAt?: number }> = new Map();
    private filePath: string;

    constructor(filePath: string = path.join(rootpath, 'fuckcache.json.t')) {
        this.filePath = filePath;
        this.loadFromDisk(); // Автоматическая загрузка данных при создании экземпляра
    }

    public set(key: string, value: any, ttl?: number): void {
        const expiresAt = ttl ? Date.now() + ttl * 1000 : undefined;
        this.cache.set(key, { value, expiresAt });
        this.saveToDisk(); // Сохраняем данные на диск после каждого изменения
    }

    public get(key: string): any | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (entry.expiresAt && entry.expiresAt < Date.now()) {
            this.cache.delete(key);
            this.saveToDisk(); // Сохраняем данные на диск после удаления истёкшей записи
            return null;
        }

        return entry.value;
    }

    public del(key: string): void {
        this.cache.delete(key);
        this.saveToDisk(); // Сохраняем данные на диск после удаления
    }

    public expire(key: string, ttl: number): boolean {
        const entry = this.cache.get(key);
        if (!entry) return false;

        entry.expiresAt = Date.now() + ttl * 1000;
        this.saveToDisk(); // Сохраняем данные на диск после обновления TTL
        return true;
    }

    public flush(): void {
        this.cache.clear();
        this.saveToDisk(); // Сохраняем данные на диск после очистки кэша
    }

    public keys(): IterableIterator<string> {
        return this.cache.keys();
    }

    public startCleanup(interval: number = 60 * 1000): void {
        setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.cache.entries()) {
                if (entry.expiresAt && entry.expiresAt < now) {
                    this.cache.delete(key);
                }
            }
            this.saveToDisk(); // Сохраняем данные на диск после очистки истёкших записей
        }, interval);
    }

    private saveToDisk(): void {
        const data = JSON.stringify(Array.from(this.cache.entries()), null, 2);
        fs.writeFileSync(this.filePath, data, 'utf-8');
    }

    private loadFromDisk(): void {
        if (fs.existsSync(this.filePath)) {
            const data = fs.readFileSync(this.filePath, 'utf-8');
            const entries = JSON.parse(data);
            this.cache = new Map(entries);
        }
    }
}

export class RedisCache {
    private redisClient: RedisClientType
    private localCache: Cache | RFSCache
    private isRedisConnected: boolean = false

    constructor() {
        if (process.env.ENV === "DEV") {
            this.localCache = new RFSCache()
        } else {
            this.redisClient = createClient()
            this.localCache = new Cache()

            this.redisClient.on('connect', () => {
                this.isRedisConnected = true
                console.log('Connected to Redis')
            })

            this.redisClient.on('error', (err) => {
                this.isRedisConnected = false
                // console.error('Redis error, falling back to local cache:', err)
            })

            this.redisClient.connect()
        }
    }

    public async set(key: string, value: any, ttl?: number): Promise<void> {
        try {
            if (this.isRedisConnected) {
                await this.redisClient.set(key, JSON.stringify(value))
                if (ttl) {
                    await this.redisClient.expire(key, ttl)
                }
            }
        } catch (err) {
            console.error('Failed to set value in Redis, using local cache:', err)
        }
        this.localCache.set(key, value, ttl)
    }

    public async get(key: string): Promise<any | null> {
        let value: any | null = null

        if (this.isRedisConnected) {
            try {
                const redisValue = await this.redisClient.get(key)
                if (redisValue !== null) {
                    value = JSON.parse(redisValue)
                    this.localCache.set(key, value)
                    return value
                }
            } catch (err) {
                console.error('Failed to get value from Redis, falling back to local cache:', err)
            }
        }

        value = this.localCache.get(key)
        return value
    }

    public async del(key: string): Promise<void> {
        try {
            if (this.isRedisConnected) {
                await this.redisClient.del(key)
            }
        } catch (err) {
            console.error('Failed to delete value from Redis:', err)
        }
        this.localCache.del(key)
    }

    public async expire(key: string, ttl: number): Promise<boolean> {
        try {
            if (this.isRedisConnected) {
                await this.redisClient.expire(key, ttl)
                return true
            }
        } catch (err) {
            console.error('Failed to set TTL in Redis:', err)
        }
        return this.localCache.expire(key, ttl)
    }

    public async flush(): Promise<void> {
        try {
            if (this.isRedisConnected) {
                await this.redisClient.flushAll()
            }
        } catch (err) {
            console.error('Failed to flush Redis:', err)
        }
        this.localCache.flush()
    }

    async editJson(key: string, path: string, newValue: any): Promise<boolean> {
        try {
            if (this.isRedisConnected) {
                await this.redisClient.json.set(key, path, newValue)
                return true
            } else {
                const value = this.localCache.get(key)
                if (value && typeof value === 'object') {
                    const keys = path.split('.')
                    let current = value
                    for (let i = 0; i < keys.length - 1; i++) {
                        current = current[keys[i]]
                        if (!current) return false
                    }
                    current[keys[keys.length - 1]] = newValue
                    this.localCache.set(key, value)
                    return true
                }
            }
        } catch (err) {
            console.error('Failed to edit JSON value:', err)
        }
        return false
    }

    async searchKeys(pattern: string): Promise<string[]> {
        try {
            if (this.isRedisConnected) {
                const keys: string[] = [];
                let cursor = 0;
                do {
                    const reply = await this.redisClient.scan(cursor, { MATCH: `*${pattern}*` });
                    cursor = reply.cursor;
                    keys.push(...reply.keys);
                } while (cursor !== 0);
                return keys;
            } else {
                const keys: string[] = [];
                for (const key of this.localCache.keys()) {
                    if (key.includes(pattern)) {
                        keys.push(key);
                    }
                }
                return keys;
            }
        } catch (err) {
            console.error('Failed to search keys:', err);
            return [];
        }
    }
}

export const Faucets = new FSCache('./faucets.json')