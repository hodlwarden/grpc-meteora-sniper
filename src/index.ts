import {
    Connection,
    Keypair,
} from "@solana/web3.js";
import base58 from "bs58";
import dotnet from 'dotenv'

import WebSocket = require("ws");
import { GEYSER_RPC, PRIVATE_KEY, RPC_ENDPOINT, RPC_WEBSOCKET_ENDPOINT } from "./constants";

dotnet.config();

const ws = new WebSocket(GEYSER_RPC);
const connection = new Connection(RPC_ENDPOINT, { wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment: "processed" });
const payerKeypair = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY))

const withGaser = () => {

    console.log('Your Pub Key => ', payerKeypair.publicKey.toString());


    function sendRequest(ws: WebSocket) {
        const request = {
            jsonrpc: "2.0",
            id: 420,
            method: "transactionSubscribe",
            params: [
                {
                    failed: false,
                    accountInclude: ["LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo"]
                },
                {
                    commitment: "processed",
                    encoding: "jsonParsed",
                    transactionDetails: "full",
                    maxSupportedTransactionVersion: 0
                }
            ]
        };
        ws.send(JSON.stringify(request));
    }

    ws.on('open', function open() {
        console.log('WebSocket is open');
        sendRequest(ws);  // Send a request once the WebSocket is open
    });

    ws.on('message', async function incoming(data) {
        const messageStr = data.toString('utf8');
        try {
            const messageObj = JSON.parse(messageStr);

            const result = messageObj.params.result;
            const logs = result.transaction.meta.logMessages;
            const signature = result.signature; // Extract the signature
            const accountKeys = result.transaction.transaction.message.accountKeys.map((ak: { pubkey: any; }) => ak.pubkey);
            const instructions = result.transaction.meta.innerInstructions;

            if (logs && logs.some((log: string | string[]) => log.includes('Program log: Instruction: InitializeCustomizablePermissionlessLbPair'))) {
                
            }
        } catch (e) {

        }
    });
}

const runBot = () => {
    console.log('--------------- Geyser mode is running! ---------------\n');
    withGaser();
}

runBot()