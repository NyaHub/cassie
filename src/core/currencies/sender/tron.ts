import { TronWeb } from 'tronweb';
import { EventEmitter } from 'events';
import { Address, TronCore } from '../tron';
import Web3 from 'web3';

type cryptoTx = any

export class TronWithdraw extends EventEmitter {



    private async getBalance(addr: string): Promise<number> {
        return await this.tronWeb.trx.getBalance(addr)
    }
    private async getFee(tx: cryptoTx): Promise<number> {
        return tx.token == "TRX" ? 2 : 50
    }
    private async buildTx(from: Address, to: string, token: string, amount: number): Promise<cryptoTx> {

        let signedTx

        if (token == "TRX") {
            const tx = await this.tronWeb.transactionBuilder.sendTrx(to, Number(TronWeb.toSun(amount)), from.addr)
            signedTx = await this.tronWeb.trx.sign(tx, from.privateKey);
        } else {
            const functionSelector = 'transfer(address,uint256)';
            const parameter = [{ type: 'address', value: this.faucet.addr }, { type: 'uint256', value: Web3.utils.fromWei(amount, this.core.getTokDat(token).decimals) }]
            const tx = await this.tronWeb.transactionBuilder.triggerSmartContract(token, functionSelector, {}, parameter);
            signedTx = await this.tronWeb.trx.sign(tx.transaction, from.privateKey);
        }

        console.log(await this.tronWeb.trx.getTransactionInfo(signedTx.txID))

        return { from, to, token, amount, signedTx }
    }
    private async requestFaucet(to: string, amount: number): Promise<string> {
        let balance = await this.getBalance(this.faucet.addr)
        let tx = await this.buildTx(this.faucet, to, "trx", amount)
        let fee = await this.getFee(tx)

        if ((balance - amount) <= fee) {
            return ""
        } else {
            this.sendTx(tx.signedTx)
            return tx.txID
        }
    }
    private async sendTx(tx: cryptoTx): Promise<cryptoTx> {
        // console.log(tx)
        const result = await this.tronWeb.trx.sendRawTransaction(tx);
        console.log(JSON.stringify(result, null, "\t"))
    }

    private txs: { tx: string, from: Address, token: string }[] = []
    private faucet: Address
    private tronWeb: TronWeb
    private core: TronCore

    public setFaucet(faucet: Address) {
        this.faucet = faucet
    }

    public isMy(txhash: string) {
        return this.txs.filter(v => v.tx === txhash)
    }

    constructor(faucet: Address, tronWeb: TronWeb, core: TronCore) {
        super()
        this.faucet = faucet
        this.tronWeb = tronWeb
        this.core = core
        this.on("send", this.onSend)
    }

    async send(from: Address, token: string) {
        this.emit('idivjopu', { from, token })
        return 'Пошел нахуй, понял!?!'
        console.log(from, token)
        let balance = await this.getBalance(from.addr)
        let tx = await this.buildTx(from, this.faucet.addr, token, balance)
        let fee = Number(this.tronWeb.toSun(await this.getFee({ tx, token }))) * 2

        if (balance <= fee) {
            let ftx = await this.requestFaucet(from.addr, (fee * 1.2) - balance)
            if (ftx.length > 0) {
                this.txs.push({ tx: ftx, from, token })
                this.once(`${ftx}_confirmed`, this.onFaucetConfirm)
            } else {
                this.emit('faucetEmpty', { from: from.addr, token })
            }
        } else {
            tx = await this.buildTx(from, this.faucet.addr, token, balance - fee)
            this.emit('send', { tx: tx.signedTx, from: from.addr, token })
        }
    }

    private async onSend(val: { tx: cryptoTx, from: Address, token: string }) {
        let { tx, from, token } = val
        let stx = await this.sendTx(tx)
        console.log({ from, tx: stx, token })
        this.txs.push({ from, tx: stx, token })
        this.once(`${stx}_confirmed`, this.onWithdrawCompleted)
    }

    private async onFaucetConfirm(val: { from: Address, token: string }) {
        this.send(val.from, val.token)
    }

    private async onWithdrawCompleted(val: { from: Address, token: string, tx: string }) {
        this.emit('withdrawCompleted', { from: val.from.addr, token: val.token, hash: val.tx })
    }
}