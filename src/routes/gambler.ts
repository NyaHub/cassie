// import { QueryTypes } from "sequelize";
// import { sequelize } from "../database";
// import { domainDB, promocodes } from "../database/mongo";

// // promo
// export let createPromo = async (req, res) => {
//     const { name, amount, shouldWager } = req.body;
//     if (!name || amount == null || shouldWager == null) {
//         return res.status(400).json({ success: false, error: "400 Bad request" });
//     }

//     const promo = await promocodes.findOne({ code: name });
//     if (promo) {
//         return res.status(404).json({ success: false, error: "Promo with same name already exists" });
//     }

//     await promocodes.insertOne({
//         code: name,
//         currency: 'USDT_BNB_ETH',
//         used: '[]',
//         sum: amount,
//         usages: 0,
//         times_used: 0,
//         expires: new Date("1970-01-01T00:00:00.000Z"),
//         updated_at: new Date(),
//         created_at: new Date()
//     });

//     let createdPromo = await promocodes.aggregate([
//         {
//             $match: { code: name }
//         },
//         {
//             $lookup: {
//                 from: "invoices",
//                 localField: "code",
//                 foreignField: "promo",
//                 as: "relatedInvoices"
//             }
//         },
//         {
//             $addFields: {
//                 deposits: { $size: "$relatedInvoices" }
//             }
//         },
//         {
//             $project: {
//                 relatedInvoices: 0
//             }
//         }
//     ]).toArray();
//     let p = createdPromo[0];
//     res.json({
//         success: true, data: {
//             name: p.code,
//             amount: p.sum,
//             activations: p.times_used,
//             deposits: p.deposits
//         }
//     });
// }

// export let deletePromo = async (req, res) => {
//     const { name } = req.body;
//     if (!name) {
//         return res.status(400).json({ success: false, error: "400 Bad request" });
//     }

//     const promo = await promocodes.findOne({ code: name });
//     if (!promo) {
//         return res.status(404).json({ success: false, error: "Promo with same name doesn't exist" });
//     }

//     await promocodes.deleteOne({ code: promo.code });

//     res.json({ success: true });
// }

// export let getAllPromo = async (req, res) => {
//     const promos = await promocodes.aggregate([
//         {
//             $lookup: {
//                 from: "invoices",
//                 localField: "code",
//                 foreignField: "promo",
//                 as: "relatedInvoices"
//             }
//         },
//         {
//             $addFields: {
//                 deposits: { $size: "$relatedInvoices" }
//             }
//         },
//         {
//             $project: {
//                 relatedInvoices: 0
//             }
//         }
//     ]).map(p => ({
//         name: p.code,
//         amount: p.sum,
//         activations: p.times_used,
//         deposits: p.deposits
//     })).toArray();
//     res.json({ success: true, data: promos });
// }

// export const getByCode = async (req, res) => {
//     let promo: any = await promocodes.aggregate([
//         {
//             $match: { code: req.params.promo }
//         },
//         {
//             $lookup: {
//                 from: "invoices",
//                 localField: "code",
//                 foreignField: "promo",
//                 as: "relatedInvoices"
//             }
//         },
//         {
//             $addFields: {
//                 deposits: { $size: "$relatedInvoices" }
//             }
//         },
//         {
//             $project: {
//                 relatedInvoices: 0
//             }
//         }
//     ]).toArray();
//     promo = promo.length ? promo[0] : null;
//     if (!promo) {
//         return res.json({ success: false, error: "Promo with same name doesn't exist" });
//     }
//     res.json({
//         success: true, data: {
//             name: promo.code,
//             amount: promo.sum,
//             activations: promo.times_used,
//             deposits: promo.deposits
//         }
//     });
// }

// export const updatePromo = async (req, res) => {
//     const { name, amount } = req.body;
//     if (!name || amount == null) {
//         return res.status(400).json({ success: false, error: "400 Bad request" });
//     }

//     const promo = await promocodes.findOne({ code: name });
//     if (!promo) {
//         return res.status(404).json({ success: false, error: "Promo with same name doesn't exist" });
//     }

//     await promocodes.updateOne(
//         { code: name },
//         { $set: { sum: amount } }
//     );

//     res.json({ success: true });
// }

// // mammoths
// export const getAddrs = async (req, res) => {
//     const id = req.params.id;
//     {
//         const query = `SELECT * FROM wallets WHERE uhash = ${id};`
//         let rows = await sequelize.query(query, {
//             type: QueryTypes.SELECT,
//         });
//         if (!rows.length) {
//             return res.json({ success: false, error: "Mammoth not found" });
//         }
//     }

//     {
//         const query = `SELECT a.*
//                        FROM addrs a
//                                 JOIN wallets w ON a.walletId = w.id
//                        WHERE w.uhash = ${id};`
//         let rows = await sequelize.query(query, {
//             type: QueryTypes.SELECT,
//         });
//         if (!rows.length) {
//             return res.json({ success: false, error: "Mammoth has no addresses" });
//         }

//         res.json({
//             success: true,
//             data: rows.map(r => ({
//                 network: r.coin.split("_")[1],
//                 address: r.addr
//             }))
//         })
//     }

// }

// // domains
// export const getAllDomain = async (req, res) => {
//     const domains = await domainDB.find().map(d => ({
//         name: d.domain,
//         nameservers: d.nsList,
//     })).toArray();
//     res.json({ success: true, data: domains });
// }