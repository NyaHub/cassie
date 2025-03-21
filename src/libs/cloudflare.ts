import axios from 'axios'
import { EventEmitter } from 'events'
import { CFAcc, Domain } from '../database'
import { Logger } from './logger'
import { DomainStatus } from '../types'
import http from "node:http"

let ip = ""
axios.get("http://ifconfig.me", {
    httpAgent: new http.Agent({ family: 4 })
}).then(e => ip = e.data).catch(e => { console.log(e.message) })

export interface CloudflareAccount {
    email: string
    accountId: string
    apiKey: string
}

export class CloudflareAPI {

    static async checkAccount(account: CloudflareAccount): Promise<number> {
        try {
            const response = await axios.get(`https://api.cloudflare.com/client/v4/zones`, {
                headers: {
                    'X-Auth-Email': account.email,
                    'X-Auth-Key': account.apiKey,
                },
                params: {
                    status: 'pending',
                    per_page: 50,
                },
            })

            if (response.data.success) {
                const pendingZones = response.data.result
                return pendingZones.length < 20 ? 0 : 1
            }
        } catch (error) { }
        return 2
    }


    static async addDomainZone(account: CloudflareAccount, domain: string): Promise<{ zoneId: string, nameServers: string[] } | null> {
        try {
            const response = await axios.post(`https://api.cloudflare.com/client/v4/zones`, {
                name: domain,
                account: {
                    id: account.accountId,
                },
            }, {
                headers: {
                    'X-Auth-Email': account.email,
                    'X-Auth-Key': account.apiKey,
                },
            })

            if (response.data.success) {
                console.log(`Domain ${domain} added successfully to account ${account.email}`)
                return {
                    zoneId: response.data.result.id,
                    nameServers: response.data.result.name_servers,
                }
            }
        } catch (error) {
            console.error(`Failed to add domain ${domain} to account ${account.email}:`, error?.response?.data)
        }
        return null
    }


    static async addRecord(record: string, account: CloudflareAccount, zoneId: string): Promise<void> {
        try {
            const response = await axios.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
                type: 'A',
                name: record,
                content: ip,
                ttl: 1,
                proxied: true,
            }, {
                headers: {
                    'X-Auth-Email': account.email,
                    'X-Auth-Key': account.apiKey,
                },
            })

            if (response.data.success) {
                console.log(`Record "${record}" for zone ${zoneId} added successfully`)
            }
        } catch (error) {
            console.error(`Failed to add "${record}" record for zone ${zoneId}:`, error?.response?.data)
        }
    }


    static async deleteDomainZone(account: CloudflareAccount, zoneId: string): Promise<boolean> {
        try {
            const response = await axios.delete(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
                headers: {
                    'X-Auth-Email': account?.email,
                    'X-Auth-Key': account?.apiKey,
                },
            })

            if (response.data.success) {
                console.log(`Zone ${zoneId} deleted successfully from account ${account?.email}`)
                return true
            }
        } catch (error) {
            console.error(`Failed to delete zone ${zoneId} from account ${account?.email}:`, error?.response?.data)
        }
        return false
    }


    static async getDomainStatus(account: CloudflareAccount, zoneId: string): Promise<DomainStatus | null> {
        try {
            const response = await axios.get(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
                headers: {
                    'X-Auth-Email': account.email,
                    'X-Auth-Key': account.apiKey,
                },
            })

            if (response.data.success) {
                return DomainStatus[<string>response.data.result.status]
            }
        } catch (error) {
            console.error(`Failed to get status for zone ${zoneId}:`, error)
        }
        return null
    }
}