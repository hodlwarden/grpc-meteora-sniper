
import Client, {
    CommitmentLevel,
    SubscribeRequest,
    SubscribeUpdate,
} from "@triton-one/yellowstone-grpc";
import { ClientDuplexStream } from '@grpc/grpc-js';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { BUY_AMOUNT, CHECK_IF_MINT_IS_BURNED, CHECK_IF_MINT_IS_FREEZABLE, CHECK_IF_MINT_IS_MINTABLE, CHECK_KEYWORD, CHECK_LIQUIDITY, CHECK_MARKET_CAP, GRPC_ENDPOINT, GRPC_TOKEN, KEYWORD, MAXIMUM_LIQUIDITY, MAXIMUM_MARKET_CAP, MINIMUM_LIQUIDITY, MINIMUM_MARKET_CAP, PRIVATE_KEY, RPC_ENDPOINT, SECOND_WALLET, SLIPPAGE } from "./constants";
import { saveToJSONFile } from "./utils";
import { fetchPoolOnMeteoraDYN, getDlmmPool, getLiquidity, getMarketCap, getPoolDataFromMeteora, getTokenPriceJup, swapOnMeteora, swapOnMeteoraDYN } from "./utils/meteoraSwap";
import { BN } from "bn.js";
import { checkBurn, checkFreezeAuthority, checkMintable, checkMutable, checkTicker, getFreezeAuthority } from "./utils/filters";
import DLMM from "@meteora-ag/dlmm";
import { startSolPricePolling } from "./handleSolPrice";

dotenv.config()

const solanaConnection = new Connection(RPC_ENDPOINT, 'processed');
const keypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
const secondPub = new PublicKey(SECOND_WALLET);

const METEORA_DLMM_PROGRAM_ID = new PublicKey(
    "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
);
const METEORA_AMM_PROGRAM_ID = new PublicKey(
    "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
);
const METEORA_VAULT_PROGRAM_ID = new PublicKey(
    "24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi",
);

// Main function
async function main(): Promise<void> {
    const client = new Client(GRPC_ENDPOINT, GRPC_TOKEN, undefined);
    const stream = await client.subscribe();
    const request = createSubscribeRequest();

    try {
        await sendSubscribeRequest(stream, request);
        console.log('Geyser connection established - watching new Meteora Pools. \n');
        await handleStreamEvents(stream);
    } catch (error) {
        console.error('Error in subscription process:', error);
        stream.end();
    }
}

// Helper functions
function createSubscribeRequest(): SubscribeRequest {
    return {
        accounts: {},
        slots: {},
        transactions: {
            meteora: {
                vote: false,
                failed: false,
                signature: undefined,
                accountInclude: [
                    METEORA_AMM_PROGRAM_ID.toBase58(),
                    METEORA_VAULT_PROGRAM_ID.toBase58()
                ],
                accountExclude: [],
                accountRequired: [],
            },
        },
        transactionsStatus: {},
        entry: {},
        blocks: {},
        blocksMeta: {},
        accountsDataSlice: [],
        ping: undefined,
        commitment: CommitmentLevel.PROCESSED,
    };
}

export function decodeTransact(data: WithImplicitCoercion<string> | { [Symbol.toPrimitive](hint: "string"): string; }) {
    const output = data ? bs58.encode(Buffer.from(data, 'base64')) : "";
    return output;
}

export function migrationOutPut(data: { transaction: { transaction: any; }; }) {
    const dataTx = data ? data?.transaction?.transaction : null;
    const signature = decodeTransact(dataTx?.signature);
    const message = dataTx?.transaction?.message
    const header = message?.header;
    const accountKeys = message?.accountKeys.map((t: WithImplicitCoercion<string> | { [Symbol.toPrimitive](hint: "string"): string; }) => {
        return decodeTransact(t)
    })
    const recentBlockhash = decodeTransact(message?.recentBlockhash);
    const instructions = message?.instructions
    const meta = dataTx?.meta
    return {
        signature,
        message: {
            header,
            accountKeys,
            recentBlockhash,
            instructions
        },
        meta
    }
}

function sendSubscribeRequest(
    stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>,
    request: SubscribeRequest
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        stream.write(request, (err: Error | null) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function handleStreamEvents(stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        stream.on('data', async (data) => {
            // timestamp1 = Date.now();
            await handleData(data)
            // if (result) {
            //     stream.end();
            //     process.exit(1)
            // }
        });
        stream.on("error", (error: Error) => {
            console.error('Stream error:', error);
            reject(error);
            stream.end();
        });
        stream.on("end", () => {
            console.log('Stream ended');
            resolve();
        });
        stream.on("close", () => {
            console.log('Stream closed');
            resolve();
        });
    });
}

let count = 0;

async function handleData(data: any) {
    try {
        if (data.transaction) {
            const transaction = data.transaction;
            const logMessages = transaction.transaction?.meta?.logMessages;

            const isVault = logMessages?.filter((item: string | string[]) => {
                if (item.indexOf('Instruction: InitializeMint2') > -1) {
                    return true
                }
            })
            if (isVault && isVault.length !== 0) {
                const tx = convertData(transaction.transaction?.signature!);
                const accounts: string[] = [];
                const accountKeys = transaction.transaction?.transaction?.message?.accountKeys;
                if (!accountKeys) return
                for (let i = 0; i < accountKeys.length; i++) {
                    const account = accountKeys[i];
                    accounts.push(convertData(account));
                }
                let poolId = '';
                let poolState = null;
                for (let i = 1; i < accounts.length; i++) {
                    const accountPub = new PublicKey(accounts[i])
                    const pool = await fetchPoolOnMeteoraDYN(solanaConnection, accountPub, keypair);
                    if (pool) {
                        poolId = accounts[i];
                        poolState = pool;
                        break;
                    } else {
                        continue
                    }
                }
                if (poolId === '') return;
                if (!poolState) return;
                if (poolState.tokenAMint.toBase58() !== 'So11111111111111111111111111111111111111112' && poolState.tokenBMint.toBase58() !== 'So11111111111111111111111111111111111111112') {
                    return
                }

                
                const mint = poolState.tokenAMint.toBase58() === 'So11111111111111111111111111111111111111112' ? poolState.tokenBMint : poolState.tokenAMint;
                console.log("Found new DYN pool! PoolId : ", poolId);
                console.log(`https://solscan.io/tx/${tx}`);
                console.log("Mint : ", mint.toBase58())
                if (CHECK_IF_MINT_IS_MINTABLE) {
                    const isMintable = await checkMintable(mint);
                    if (!isMintable) {
                        return console.log("This token is mintable!")
                    }
                }

                if (CHECK_IF_MINT_IS_BURNED) {
                    const isLpBurn = await checkBurn(poolState.lpMint);
                    if (!isLpBurn) {
                        return console.log("This token's LP is not burned yet!")
                    }
                }

                if (CHECK_IF_MINT_IS_FREEZABLE) {
                    const isFreeze = await getFreezeAuthority(mint);
                    if (isFreeze) {
                        return console.log("This token has freeze authority!")
                    }
                }

                if (CHECK_KEYWORD) {
                    const isKeyword = await checkTicker(solanaConnection, mint, KEYWORD);
                    if (!isKeyword) {
                        return console.log("Token symbol is not same, going to skip!");
                    }
                }
                

                let checked_market = false;
                if (CHECK_MARKET_CAP) {
                    console.log("Checking MartketCap!")
                    const poolPub = new PublicKey(poolId);
                    const marketcap = await getMarketCap(solanaConnection, keypair, poolPub);
                    console.log("MarketCap => ", marketcap?marketcap.toFixed(2):0)
                    if (!marketcap || !(marketcap >= MINIMUM_MARKET_CAP && marketcap <= MAXIMUM_MARKET_CAP)) {
                        return console.log("This token is out of our range! going to skip!")
                    }
                    checked_market = true;
                }
                
                let checked_liquidity = false;
                if (CHECK_LIQUIDITY) {
                    console.log("Checking Liquidity!")
                    const poolPub = new PublicKey(poolId);
                    const liquidity = await getLiquidity(solanaConnection, keypair, poolPub);
                    console.log("Liquidity => ", liquidity?liquidity.toFixed(2):0, 'Sol')
                    if (!liquidity || !(liquidity >= MINIMUM_LIQUIDITY && liquidity <= MAXIMUM_LIQUIDITY)) {
                        return console.log("This token is out of our range! going to skip!")
                    }
                    checked_liquidity = true;
                }
                if (!(checked_market && !CHECK_MARKET_CAP)) {
                    return
                }
                if (!(checked_liquidity && !CHECK_LIQUIDITY)) {
                    return
                }
                const poolPub = new PublicKey(poolId);
                const buyAmount = new BN(BUY_AMOUNT * LAMPORTS_PER_SOL);
                console.log("Going to buy!");
                const sig = await swapOnMeteoraDYN(solanaConnection, poolPub, keypair, buyAmount, false, secondPub, SLIPPAGE);
                if (sig) {
                    console.log("Buy Success :", `https://solscan.io/tx/${sig}`);
                    console.log("\n")
                    return
                } else {
                    console.log("Buy failed!")
                    console.log("\n")
                    return
                }
            }
        }
    } catch (error) {
        console.log("🚀 ~ handleData ~ error:", error)
    }
}

const tryTogetDlmmPool = async (poolId: string): Promise<DLMM> => {
    return new Promise((resolve) => {
        const monitor = setInterval(async () => {
            const pool = await getDlmmPool(solanaConnection, poolId);
            if (pool) {
                clearInterval(monitor);
                resolve(pool)
            }
        }, 500);
    })
}

const tryBuyUntilSuccess = async (poolId: string): Promise<string> => {
    return new Promise((resolve) => {
        const monitor = setInterval(async () => {
            const sig = await swapOnMeteora(solanaConnection, keypair, BUY_AMOUNT, false, poolId);
            if (sig) {
                clearInterval(monitor);
                resolve(`https://solscan.io/tx/${sig}`)
            } else if (sig !== null) {
                clearInterval(monitor);
                resolve('Token A is not wsol!')
            }
        }, 500);
    })
}

function convertData(data: Uint8Array): string {
    return bs58.encode(Buffer.from(data));
}

main().catch((err) => {
    console.error('Unhandled error in main:', err);
    process.exit(1);
});

const fetchDynMarketUntil = async (poolId: string) => {
    const poolPub = new PublicKey(poolId);
    return new Promise((resolve) => {
        const intervalId = setInterval(async () => {
            const marketcap = await getMarketCap(solanaConnection, keypair, poolPub);
            console.log("🚀 ~ intervalId ~ marketcap:", marketcap)

            if (!marketcap) {
                clearInterval(intervalId); // Stop the interval
                resolve(null)
            } else if (marketcap >= MINIMUM_MARKET_CAP) {
                clearInterval(intervalId); // Stop the interval
                resolve(true); // Return true if the marketcap reaches the target value
            } else {
                console.log("Current Market Cap : ", marketcap)
            }
        }, 1000);
    })
}



// async function getTokenPrice() {
//     const poolPub = new PublicKey('2J4tdRpBEADVJfgTAGYYE9dpbDkpyDc5jiBpBGGR96Np')
//     setInterval(async () => {
//         const marketcap = await getMarketCap(solanaConnection, keypair, poolPub);
//         console.log("🚀 ~ setTimeout ~ marketcap:", marketcap)
//     }, 3000)
// }
startSolPricePolling()
// getTokenPrice();

// const buyTest = async () => {
//     const poolPub = new PublicKey('4SXbSf36aJJdEfdB3YrXCRTxfEeWUX9frF7n5ia72dxy')
//     const buyAmount = new BN(BUY_AMOUNT * LAMPORTS_PER_SOL)
//     const sig = await swapOnMeteoraDYN(solanaConnection, poolPub, keypair, buyAmount, false, keypair2.publicKey, SLIPPAGE);
//     console.log("Buy Success :", `https://solscan.io/tx/${sig}`);
// }

// buyTest()
