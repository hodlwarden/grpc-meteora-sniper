import DLMM from '@meteora-ag/dlmm';
import { Wallet, AnchorProvider, Program } from '@coral-xyz/anchor';
import AmmImpl from '@mercurial-finance/dynamic-amm-sdk';
import { Amm as AmmIdl, IDL as AmmIDL } from './idl';
import { Commitment, Connection, Finality, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, createTransferInstruction } from '@solana/spl-token';
import { BLOXROUTE_MODE, JITO_MODE, NEXT_BLOCK_API, NEXT_BLOCK_FEE, NEXTBLOCK_MODE } from '../constants';
import { jitoWithAxios } from '../executor/jito';
import { bloXroute_executeAndConfirm } from '../executor/bloXroute';
import { saveToJSONFile } from './utils';
import axios from 'axios';
import { getSolPriceFromFile } from '../handleSolPrice';

export const DEFAULT_COMMITMENT: Commitment = "finalized";
export const DEFAULT_FINALITY: Finality = "finalized";
export const PROGRAM_ID = 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB';


interface Payload {
  transaction: TransactionMessages;
}

interface TransactionMessages {
  content: string;
}

export const getDlmmPool = async (connection: Connection, poolId: string) => {
  try {
    const poolKey = new PublicKey(poolId);
    const dlmmPool = await DLMM.create(connection, poolKey);
    return dlmmPool
  } catch (error) {
    return null;
  }
}

export const swapOnMeteora = async (connection: Connection, wallet: Keypair, amount: number, swapForY: boolean, poolId: string) => {
  try {
    const poolKey = new PublicKey(poolId);
    const dlmmPool = await DLMM.create(connection, poolKey);
    const swapAmount = new BN(amount * LAMPORTS_PER_SOL);
    const binArrays = await dlmmPool.getBinArrayForSwap(swapForY);
    const tokenY = dlmmPool.tokenY.publicKey.toBase58();
    if (tokenY !== NATIVE_MINT.toBase58()) {
      console.log('Token Y : ', tokenY)
      console.log("Y token is not wsol! Going to skip!");
      return false
    }

    const swapQuote = dlmmPool.swapQuote(
      swapAmount,
      swapForY,
      new BN(10000),
      binArrays
    );

    const transaction = await dlmmPool.swap({
      inToken: swapForY ? dlmmPool.tokenX.publicKey : dlmmPool.tokenY.publicKey,
      binArraysPubkey: swapQuote.binArraysPubkey,
      inAmount: swapAmount,
      lbPair: dlmmPool.pubkey,
      user: wallet.publicKey,
      minOutAmount: swapQuote.minOutAmount,
      outToken: swapForY ? dlmmPool.tokenY.publicKey : dlmmPool.tokenX.publicKey,
    });
    if (JITO_MODE) {
      const latestBlockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [...transaction.instructions]
      }).compileToV0Message();
      const vTransaction = new VersionedTransaction(messageV0);
      const sig = await jitoWithAxios([vTransaction], wallet, connection);
      if (sig.confirmed) {
        return sig.jitoTxsignature
      } else {
        return false
      }
    } else if (NEXTBLOCK_MODE) {
      const next_block_addrs = [
        'NEXTbLoCkB51HpLBLojQfpyVAMorm3zzKg7w9NFdqid',
        'NeXTBLoCKs9F1y5PJS9CKrFNNLU1keHW71rfh7KgA1X',
        'NexTBLockJYZ7QD7p2byrUa6df8ndV2WSd8GkbWqfbb',
        'neXtBLock1LeC67jYd1QdAa32kbVeubsfPNTJC1V5At',
        'nEXTBLockYgngeRmRrjDV31mGSekVPqZoMGhQEZtPVG',
        'nextBLoCkPMgmG8ZgJtABeScP35qLa2AMCNKntAP7Xc',
        'NextbLoCkVtMGcV47JzewQdvBpLqT9TxQFozQkN98pE',
        'NexTbLoCkWykbLuB1NkjXgFWkX9oAtcoagQegygXXA2'
      ]

      for (let i = 0; i < next_block_addrs.length; i++) {
        const next_block_addr = next_block_addrs[i];

        if (!next_block_addr) return console.log("Nextblock wallet is not provided");
        if (!NEXT_BLOCK_API) return console.log("Nextblock block api is not provided");

        // NextBlock Instruction
        const recipientPublicKey = new PublicKey(next_block_addr);
        const transferInstruction = SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: recipientPublicKey,
          lamports: NEXT_BLOCK_FEE * LAMPORTS_PER_SOL
        });

        transaction.add(transferInstruction);
        transaction.sign(wallet)

        const tx64Str = transaction.serialize().toString('base64');
        const payload: Payload = {
          transaction: {
            content: tx64Str
          }
        };

        try {
          const response = await fetch('https://fra.nextblock.io/api/v2/submit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'authorization': NEXT_BLOCK_API // Insert your authorization token here
            },
            body: JSON.stringify(payload)
          });

          const responseData = await response.json();

          if (response.ok) {
            return responseData.signature?.toString()
          } else {
            console.error("Failed to send transaction:", response.status, responseData);
            return false
          }
        } catch (error) {
          console.error("Error sending transaction:", error);
          return false
        }
      }
    } else if (BLOXROUTE_MODE) {
      const result = await bloXroute_executeAndConfirm(transaction, wallet);
      if (result) {
        return result
      } else {
        return false
      }
    } else {
      const swapTxHash = await sendAndConfirmTransaction(connection, transaction, [
        wallet,
      ]);
      return swapTxHash;
    }
  } catch (error) {
    return null;
  }
}

export const buildVersionedTx = async (
  connection: Connection,
  payer: PublicKey,
  tx: Transaction,
  commitment: Commitment = DEFAULT_COMMITMENT
): Promise<VersionedTransaction> => {
  const blockHash = (await connection.getLatestBlockhash(commitment)).blockhash;

  let messageV0 = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockHash,
    instructions: tx.instructions,
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
};

export const swapOnMeteoraDYN = async (connection: Connection, poolAddress: PublicKey, wallet: Keypair, swapAmount: BN, swapAtoB: boolean, toWallet: PublicKey, slippage: number) => {
  try {
    const mockWallet = new Wallet(wallet);
    const provider = new AnchorProvider(connection, mockWallet, {
      commitment: 'confirmed',
    });
    const ammProgram = new Program<AmmIdl>(AmmIDL, PROGRAM_ID, provider);
    let poolState = await ammProgram.account.pool.fetch(poolAddress);
    const pool = await AmmImpl.create(provider.connection, poolAddress);
    let inTokenMint = swapAtoB ? poolState.tokenAMint : poolState.tokenBMint;
    let outTokenMint = swapAtoB ? poolState.tokenBMint : poolState.tokenAMint;
    // console.log(inTokenMint.toBase58(),": ", swapAmount)
    let swapQuote = pool.getSwapQuote(inTokenMint, swapAmount, slippage);
    const transaction = await pool.swap(
      mockWallet.publicKey,
      inTokenMint,
      swapAmount,
      swapQuote.minSwapOutAmount,
    );

    console.log(await connection.simulateTransaction(transaction))
    let buySig;
    if (JITO_MODE) {
      const latestBlockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [...transaction.instructions]
      }).compileToV0Message();
      const vTransaction = new VersionedTransaction(messageV0);
      const sig = await jitoWithAxios([vTransaction], wallet, connection);
      if (sig.confirmed) {
        buySig = sig.jitoTxsignature
        // return sig.jitoTxsignature
      } else {
        return false
      }
    } else if (NEXTBLOCK_MODE) {
      const next_block_addrs = [
        'NEXTbLoCkB51HpLBLojQfpyVAMorm3zzKg7w9NFdqid',
        // 'NeXTBLoCKs9F1y5PJS9CKrFNNLU1keHW71rfh7KgA1X',
        // 'NexTBLockJYZ7QD7p2byrUa6df8ndV2WSd8GkbWqfbb',
        // 'neXtBLock1LeC67jYd1QdAa32kbVeubsfPNTJC1V5At',
        // 'nEXTBLockYgngeRmRrjDV31mGSekVPqZoMGhQEZtPVG',
        // 'nextBLoCkPMgmG8ZgJtABeScP35qLa2AMCNKntAP7Xc',
        // 'NextbLoCkVtMGcV47JzewQdvBpLqT9TxQFozQkN98pE',
        // 'NexTbLoCkWykbLuB1NkjXgFWkX9oAtcoagQegygXXA2'
      ]

      for (let i = 0; i < next_block_addrs.length; i++) {
        const next_block_addr = next_block_addrs[i];

        if (!next_block_addr) return console.log("Nextblock wallet is not provided");
        if (!NEXT_BLOCK_API) return console.log("Nextblock block api is not provided");

        // NextBlock Instruction
        const recipientPublicKey = new PublicKey(next_block_addr);
        const transferInstruction = SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: recipientPublicKey,
          lamports: NEXT_BLOCK_FEE * LAMPORTS_PER_SOL
        });

        transaction.add(transferInstruction);

        transaction.sign(wallet)

        const tx64Str = transaction.serialize().toString('base64');
        const payload: Payload = {
          transaction: {
            content: tx64Str
          }
        };

        try {
          const response = await fetch('https://fra.nextblock.io/api/v2/submit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'authorization': NEXT_BLOCK_API // Insert your authorization token here
            },
            body: JSON.stringify(payload)
          });

          const responseData = await response.json();

          if (response.ok) {
            buySig = responseData.signature?.toString()
            // return responseData.signature?.toString()
          } else {
            console.error("Failed to send transaction:", response.status, responseData);
            return false
          }
        } catch (error) {
          console.error("Error sending transaction:", error);
          return false
        }
      }
    } else if (BLOXROUTE_MODE) {
      const result = await bloXroute_executeAndConfirm(transaction, wallet);
      if (result) {
        buySig = result;
        // return result
      } else {
        return false
      }
    } else {
      const swapTxHash = await sendAndConfirmTransaction(connection, transaction, [
        wallet,
      ]);
      buySig = swapTxHash;
      // return swapTxHash;
    }
    const fromWalletAta = getAssociatedTokenAddressSync(outTokenMint, wallet.publicKey);

    // Fetch token account balance with retry
    const info = await fetchTokenAccountBalanceWithRetry(connection, fromWalletAta);
    console.log("🚀 ~ swapOnMeteoraDYN ~ info:", info)
    const tokenBalance = info.value.amount;

    if (!tokenBalance) return console.log("No Token Balance!")

    // Prepare the transaction
    const sendTokenTx = new Transaction();
    const toWalletAta = getAssociatedTokenAddressSync(outTokenMint, toWallet);

    // Check if the destination token account exists, and create it if not
    if (!await connection.getAccountInfo(toWalletAta)) {
      sendTokenTx.add(
        createAssociatedTokenAccountInstruction(wallet.publicKey, toWalletAta, toWallet, outTokenMint)
      );
    }

    // Add the transfer instruction
    sendTokenTx.add(
      createTransferInstruction(fromWalletAta, toWalletAta, wallet.publicKey, Number(tokenBalance))
    );

    const latestBlockHash = await connection.getLatestBlockhash('confirmed');
    sendTokenTx.recentBlockhash = latestBlockHash.blockhash;
    sendTokenTx.feePayer = wallet.publicKey;
    console.log(await connection.simulateTransaction(sendTokenTx))
    const signature = await sendAndConfirmTransaction(connection, sendTokenTx, [wallet]);
    return signature;
  } catch (error) {
    console.log("🚀 ~ swapOnMeteoraDYN ~ error:", error)
    return null;
  }
}

const MAX_RETRIES = 5; // Maximum number of retries
const RETRY_DELAY = 1000; // Delay between retries in milliseconds (1 second)

async function fetchTokenAccountBalanceWithRetry(connection: Connection, fromWalletAta: PublicKey, retries = MAX_RETRIES) {
  try {
    const info = await connection.getTokenAccountBalance(fromWalletAta);
    if (!info) throw new Error('No token account info found');
    if (info.value.uiAmount == null) throw new Error('No balance found');
    return info; // Return the balance info if successful
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying... Attempts left: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY)); // Wait before retrying
      return fetchTokenAccountBalanceWithRetry(connection, fromWalletAta, retries - 1); // Retry
    } else {
      throw new Error(`Failed to fetch token account balance after ${MAX_RETRIES}`);
    }
  }
}

async function sendTransactionWithRetry(connection: Connection, transaction: Transaction, wallet: Keypair, retries = MAX_RETRIES) {
  try {
    const latestBlockHash = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = latestBlockHash.blockhash;
    const signature = await sendAndConfirmTransaction(connection, transaction, [wallet]);
    return signature; // Return the transaction signature if successful
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying... Attempts left: ${retries}`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY)); // Wait before retrying
      return sendTransactionWithRetry(connection, transaction, wallet, retries - 1); // Retry
    } else {
      throw new Error(`Failed to send transaction after ${MAX_RETRIES}`);
    }
  }
}

export const fetchPoolOnMeteoraDYN = async (connection: Connection, poolAddress: PublicKey, wallet: Keypair) => {
  try {
    const mockWallet = new Wallet(wallet);
    const provider = new AnchorProvider(connection, mockWallet, {
      commitment: 'confirmed',
    });
    const ammProgram = new Program<AmmIdl>(AmmIDL, PROGRAM_ID, provider);
    let poolState = await ammProgram.account.pool.fetch(poolAddress);
    if (poolState) {
      return poolState
    } else {
      return false
    }
  } catch (error) {
    return null;
  }
}

export const getMarketCap = async (connection: Connection, wallet: Keypair, poolAddress: PublicKey) => {
  const mockWallet = new Wallet(wallet);
  const provider = new AnchorProvider(connection, mockWallet, {
    commitment: 'confirmed',
  });

  const pool = await AmmImpl.create(provider.connection, poolAddress);

  const mintA = pool.tokenAMint.address.toBase58();
  const mintB = pool.tokenBMint.address.toBase58();

  if (mintA !== 'So11111111111111111111111111111111111111112' && mintB !== 'So11111111111111111111111111111111111111112') {
    console.log("Its not $token/$wsol pool");
    return false
  }

  const tokenASupply = (mintA === 'So11111111111111111111111111111111111111112') ? Number(pool.tokenBMint.supply) / (10 ** pool.tokenBMint.decimals) : Number(pool.tokenAMint.supply) / (10 ** pool.tokenAMint.decimals);
  const solprice = getSolPriceFromFile();

  // Get token amounts as BN objects
  const tokenAAmount = mintA === 'So11111111111111111111111111111111111111112' ? Number(pool.poolInfo.tokenAAmount) / (10 ** pool.tokenAMint.decimals) : Number(pool.poolInfo.tokenBAmount) / (10 ** pool.tokenBMint.decimals);
  const tokenBAmount = mintB === 'So11111111111111111111111111111111111111112' ? Number(pool.poolInfo.tokenAAmount) / (10 ** pool.tokenAMint.decimals) : Number(pool.poolInfo.tokenBAmount) / (10 ** pool.tokenBMint.decimals);

  // Calculate a / b
  const priceSol = Number(tokenAAmount) / Number(tokenBAmount); // 18 is the desired decimal precision
  if (!priceSol) {
    return false
  }
  if (!solprice) return false
  return Number(priceSol) * solprice * Number(tokenASupply);
};

/**
 * Calculate the ratio of two BN numbers with a specified precision.
 * @param a - The numerator (BN object).
 * @param b - The denominator (BN object).
 * @param precision - The number of decimal places to include in the result.
 * @returns The ratio as a string with the specified precision.
 */
function calculateRatio(a: BN, b: BN, precision: number): string | null {
  if (b.isZero()) {
    return null
  }

  // Multiply 'a' by 10^precision to handle decimal places
  const scaledA = a.mul(new BN(10).pow(new BN(precision)));
  const result = scaledA.div(b); // Perform the division

  // Convert the result to a string and insert the decimal point
  const resultStr = result.toString();
  const integerPart = resultStr.slice(0, -precision) || '0'; // Handle cases where result is smaller than precision
  const decimalPart = resultStr.slice(-precision).padStart(precision, '0'); // Pad with leading zeros if necessary

  return `${integerPart}.${decimalPart}`;
}

export const getTokenPriceJup = async (mint: string) => {
  const response = await fetch(
    `https://api.jup.ag/price/v2?ids=${mint}`
  );
  const data: any = await response.json();
  console.log("🚀 ~ getTokenPriceJup ~ data:", data)
  const solPrice = Number(data.data[mint].price)
  console.log("🚀 ~ getTokenPriceJup ~ solPrice:", solPrice)
}

export async function getPoolDataFromMeteora(poolAddress: string) {
  try {
    const url = 'https://amm-v2.meteora.ag/pools';

    const params = {
      address: poolAddress.toString(),
    };

    const response = await axios.get(url, {
      headers: {
        accept: 'application/json',
      },
      params: params,
    });
    const meteora_pool = response.data[0];
    // console.log('response meteora pool data:', meteora_pool);

    const pairRatio =
      meteora_pool.pool_token_amounts[0] / meteora_pool.pool_token_amounts[1];
    console.log("🚀 ~ getPoolDataFromMeteora ~ pairRatio:", pairRatio)

    return {
      normalizedPrice: pairRatio,
      feeRate: meteora_pool.total_fee_pct / 100,
    };
  } catch (error) {
    console.error('Error fetching Meteora Pool Info:', error);
  }
}