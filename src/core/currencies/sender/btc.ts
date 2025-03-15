import { EventEmitter } from 'events';
import { Address, BitcoinCore } from '../btc';
import axios from 'axios';
import * as bitcoin from 'bitcoinjs-lib';

export class BTCWithdraw extends EventEmitter {
    private async fetchUTXOs(address: string): Promise<any[]> {
        const response = await axios.get(`${this.MEMPOOL_API_URL}/address/${address}/utxo`);
        return response.data.map((utxo: any) => ({
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value, // Значение уже в сатоши
            scriptPubKey: utxo.scriptpubkey,
        }));
    }

    // Функция для получения текущей комиссии за байт
    private async fetchFeeRate(): Promise<number> {
        const response = await axios.get(`${this.MEMPOOL_API_URL}/v1/fees/recommended`)
        return response.data.economyFee
    }

    private async getRawTx(txid: string): Promise<string> {
        const response = await axios.get(`${this.MEMPOOL_API_URL}/tx/${txid}/hex`)
        return response.data
    }

    private estimateTransactionSize(inputCount: number, outputCount: number): number {
        // Примерная оценка размера транзакции:
        // - Каждый вход: ~148 байт
        // - Каждый выход: ~34 байт
        // - Оверхеды: ~10 байт + 10 (на всякий)
        return inputCount * 148 + outputCount * 34 + 10 + 10;
    }

    private async sendAllBitcoin(
        privateKeyHex: string, // Приватный ключ в формате HEX
        senderAddress: string,
        recipientAddress: string
    ): Promise<string | number> {
        // Создаем ключевую пару из приватного ключа в формате HEX
        const keyPair = bitcoin.ECPair.fromPrivateKey(Buffer.from(privateKeyHex, 'hex'), { network: this.network, compressed: false });
        const p2pkh = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network: this.network });

        // Получаем все UTXO для адреса отправителя
        const utxos = await this.fetchUTXOs(senderAddress);

        // Считаем общую сумму всех UTXO
        const totalAmount = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

        // Получаем текущую комиссию за байт
        const feeRate = await this.fetchFeeRate();

        // Оцениваем размер транзакции
        const inputCount = utxos.length;
        const outputCount = 1; // Один выход на получателя
        const transactionSize = this.estimateTransactionSize(inputCount, outputCount);

        // Рассчитываем общую комиссию
        const fee = feeRate * transactionSize;

        // Проверяем, достаточно ли средств для комиссии
        if (totalAmount <= fee) {
            console.log("fee", totalAmount, fee, utxos)
            return 1
        }

        // Создаем новую транзакцию
        const psbt = new bitcoin.Psbt({ network: this.network });

        // console.log(utxos)
        // Добавляем все UTXO как входы
        for (let utxo of utxos) {
            let rtx = await this.getRawTx(utxo.txid)
            // console.log(rtx.substring(8, 12))

            // if (rtx.substring(8, 12) === '0001') {
            //     // add segwit transaction input
            //     let ttx = bitcoin.Transaction.fromHex(rtx)
            //     console.log({
            //         // @ts-ignore
            //         hash: utxo.txid,
            //         index: utxo.vout,
            //         witnessUtxo: {
            //             script: ttx.outs[utxo.vout].script,
            //             value: utxo.value
            //         }
            //     })

            //     psbt.addInput({
            //         // @ts-ignore
            //         hash: utxo.txid,
            //         index: utxo.vout,
            //         witnessUtxo: {
            //             script: ttx.outs[utxo.vout].script,
            //             value: utxo.value
            //         }
            //     })
            // } else {

            // console.log({
            //     // @ts-ignore
            //     hash: utxo.txid,
            //     index: utxo.vout,
            //     nonWitnessUtxo: Buffer.from(rtx, 'hex')
            // })
            // add non-segwit transaction input
            psbt.addInput({
                // @ts-ignore
                hash: utxo.txid,
                index: utxo.vout,
                nonWitnessUtxo: Buffer.from(rtx, 'hex')
            })
            // }
        }

        // Добавляем выход на адрес получателя (общая сумма минус комиссия)
        psbt.addOutput({
            address: recipientAddress,
            value: totalAmount - fee,
        });

        // Подписываем все входы
        utxos.forEach((utxo, index) => {
            psbt.signInput(index, keyPair);
        });

        // Финализируем транзакцию
        psbt.finalizeAllInputs();

        // Получаем HEX-представление транзакции
        const txHex = psbt.extractTransaction().toHex();

        // Отправляем транзакцию в сеть через mempool.space
        const response = await axios.post(`${this.MEMPOOL_API_URL}/tx`, txHex, {
            headers: { 'Content-Type': 'text/plain' },
        });
        return response.data;
        // return txHex
    }

    private txs: { tx: string, from: Address, value: any }[] = []
    private faucet: Address
    private core: BitcoinCore
    public native: string = "BTC"
    private abi: any
    private network: any
    private MEMPOOL_API_URL: any

    public isMy(txhash: string) {
        return this.txs.filter(v => v.tx === txhash)
    }

    public setFaucet(faucet: Address) {
        this.faucet = faucet
    }

    constructor(faucet: Address, core: BitcoinCore, net: string) {
        super()
        this.faucet = faucet
        this.core = core

        this.network = net === "testnet" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin
        this.MEMPOOL_API_URL = this.network === bitcoin.networks.testnet
            ? 'https://mempool.space/testnet/api'
            : 'https://mempool.space/api'
    }

    async send(from: Address, val: number, to: string) {
        let hash = await this.sendAllBitcoin(from.privateKey, from.addr, to)
        if (hash == 1) {
            return this.emit('no_for_fee_on_native', { from: from.addr, token: this.native })
        }

        this.txs.push({ tx: hash.toString(), from, value: val })
        this.once(`${hash}_confirmed`, this.onWithdrawCompleted)
    }

    private async onWithdrawCompleted(val: { from: Address, tx: string }) {
        this.emit('withdrawCompleted', { from: val.from.addr, token: this.native, hash: val.tx })
    }
}