import { EventEmitter } from 'events';
import Web3 from 'web3';
import { Address, EtherCore } from '../eth';
import { Transaction } from 'web3-types';

type cryptoTx = any

type Tx = {
    from: Address,
    to: string,
    value: bigint | number | string
}

export class EthWithdraw extends EventEmitter {
    private async getBalance(addr: string): Promise<bigint> {
        return await this.web3.eth.getBalance(addr)
    }
    private async requestFaucet(to: string, amount: number): Promise<string> {
        let balance = await this.getBalance(this.faucet.addr)
        let gasprice = await this.web3.eth.getGasPrice()
        let fee = Number(gasprice) * 21000

        if ((Number(balance) - amount) <= fee) {
            return ""
        } else {
            await this.sendTx({ from: this.faucet, to, value: amount }, this.native)
        }
    }
    private async sendTx(tx: Tx, token: string): Promise<cryptoTx> {
        let transaction

        if (token == this.native) {
            const feeData = await this.web3.eth.calculateFeeData();
            transaction = {
                from: tx.from.addr,
                to: tx.to,
                value: tx.value,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            };
        } else {
            let ctr = new this.web3.eth.Contract(this.abi, token, { from: tx.from.addr })
            const transfer = ctr.methods.transfer(tx.to, tx.value);
            const transferOpts = { from: tx.from.addr };
            const transactionDraft = transfer.populateTransaction(transferOpts);
            const feeData = await this.web3.eth.calculateFeeData();
            transaction = {
                ...transactionDraft,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
            };
        }

        const signedTransaction = await this.web3.eth.accounts.signTransaction(
            transaction,
            tx.from.privateKey,
        );
        const receipt = await this.web3.eth.sendSignedTransaction(signedTransaction.rawTransaction);
        return receipt.transactionHash
    }

    private txs: { tx: string, from: Address, token: string, value: any, to: string }[] = []
    private faucet: Address
    private web3: Web3
    private core: EtherCore
    public native: string = "ETH"
    private abi: any

    public isMy(txhash: string) {
        return this.txs.filter(v => v.tx === txhash)
    }

    public setFaucet(faucet: Address) {
        this.faucet = faucet
    }

    constructor(faucet: Address, web3: Web3, core: EtherCore) {
        super()
        this.faucet = faucet
        this.web3 = web3
        this.core = core
        this.abi = [{
            "constant": false,
            "inputs": [
                {
                    "name": "_to",
                    "type": "address"
                },
                {
                    "name": "_value",
                    "type": "uint256"
                }
            ],
            "name": "transfer",
            "outputs": [
                {
                    "name": "",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        }]
    }

    async send(from: Address, token: string, val: number, to: string) {
        let balance = await this.getBalance(from.addr)
        let fee = await this.web3.eth.getGasPrice() * BigInt(token == this.native ? 21000 : 65000)

        if (balance <= fee && token != this.native) {
            let ftx = await this.requestFaucet(from.addr, (Number(fee) * 1.2) - Number(balance))
            if (ftx.length > 0) {
                this.txs.push({ tx: ftx, from, token, value: token === this.native ? balance - fee : val, to })
                this.once(`${ftx}_confirmed`, this.onFaucetConfirm)
            } else {
                this.emit('faucetEmpty', { from: from.addr, token })
            }
        } else {
            if (balance <= fee) {
                return this.emit("no_for_fee_on_native", { from: from.addr, token })
            }

            let hash = await this.sendTx({ from, to, value: token === this.native ? balance - fee : val }, token)
            this.txs.push({ tx: hash, from, token, value: token === this.native ? balance - fee : val, to })
            this.once(`${hash}_confirmed`, this.onWithdrawCompleted)
        }
    }

    private async onFaucetConfirm(val: { tx: string, from: Address, token: string, value: any, to: string }) {
        this.send(val.from, val.token, val.value, val.to)
    }

    private async onWithdrawCompleted(val: { from: Address, token: string, tx: string }) {
        this.emit('withdrawCompleted', { from: val.from.addr, token: val.token, hash: val.tx })
    }
}