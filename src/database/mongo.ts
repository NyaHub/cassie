// import { Collection, Db, MongoClient } from "mongodb"
// import { getOrCreateCFGVar } from "../utils";
// import { Logger } from "../libs/logger";


// const url = getOrCreateCFGVar('MONGO_URL', './.env', () => "")
// const dbName = getOrCreateCFGVar('MONGO_DB', './.env', () => "database")

// const client = new MongoClient(url)

// export const mongoDB: Db = client.db(dbName)
// export const cfDB: Collection = mongoDB.collection('CF_COL')
// export const domainDB: Collection = mongoDB.collection('Domain')
// export const promocodes: Collection = mongoDB.collection('promocodes')
// export const invoices: Collection = mongoDB.collection('invoices')


// export async function mongoinit(logger: Logger) {

//     if (dbName === "database") logger.info('CFG: MONGO_DB var is set to the default "database"')
//     if (!url) {
//         logger.fat('CFG Error: MONGO_URL var is not set!')
//         process.abort()
//     }

//     await client.connect()
// }