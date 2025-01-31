import DLMM from '@meteora-ag/dlmm';
import { Wallet, AnchorProvider, Program } from '@coral-xyz/anchor';
import AmmImpl from '@mercurial-finance/dynamic-amm-sdk';
import { Amm as AmmIdl, IDL as AmmIDL } from './idl';
import { Commitment, Connection, Finality, Keypair, LAMPORTS_PER_SOL, PublicKey, sendAndConfirmTransaction, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import BN from 'bn.js';
import { NATIVE_MINT } from '@solana/spl-token';
import { BLOXROUTE_MODE, JITO_MODE, NEXT_BLOCK_API, NEXT_BLOCK_FEE, NEXTBLOCK_MODE } from '../constants';
import { executeJitoTx } from '../executor/jito';
import { Message } from '@solana/web3.js';
import { bloXroute_executeAndConfirm } from '../executor/bloXroute';
// import { solanaConnection } from '..';

export const DEFAULT_COMMITMENT: Commitment = "finalized";
export const DEFAULT_FINALITY: Finality = "finalized";
export const PROGRAM_ID = 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB';


interface Payload {
  transaction: TransactionMessages;
}

interface TransactionMessages {
  content: string;
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
      console.log("   ✅ - Compiled Transaction Message");
      const vTransaction = new VersionedTransaction(messageV0);
      const sig = await executeJitoTx([vTransaction], wallet, 'confirmed', latestBlockhash)
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
            return transaction.signature?.toString()
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

export const swapOnMeteoraDYN = async (solanaConnection: Connection, poolAddress: PublicKey, wallet: Keypair, swapAmount: BN, swapAtoB: boolean) => {
  try {
    const mockWallet = new Wallet(wallet);
    const provider = new AnchorProvider(solanaConnection, mockWallet, {
      commitment: 'confirmed',
    });
    //@ts-ignore
    const ammProgram = new Program<AmmIdl>(AmmIDL, PROGRAM_ID, provider);
    //@ts-ignore
    let poolState = await ammProgram.account.pool.fetch(poolAddress);
    const pool = await AmmImpl.create(provider.connection, poolAddress);
    const lpSupply = await pool.getLpSupply();
    let inTokenMint = swapAtoB ? poolState.tokenAMint : poolState.tokenBMint;
    // console.log(inTokenMint.toBase58(),": ", swapAmount)
    let swapQuote = pool.getSwapQuote(inTokenMint, swapAmount, 100);
    // console.log(swapQuote)
    const swapTx = await pool.swap(
      mockWallet.publicKey,
      inTokenMint,
      swapAmount,
      swapQuote.minSwapOutAmount,
    );
    // console.log(await solanaConnection.simulateTransaction(swapTx));
    const swapResult = await provider.sendAndConfirm(swapTx);
    return swapResult;
  } catch (error) {
    return null;
    // console.log("----------------------meteora dyn--------------------\n",error);
  }
}