import { struct, u32, u8 } from '@solana/buffer-layout';
import { bool, publicKey, u64 } from '@solana/buffer-layout-utils';
import { Connection, PublicKey } from '@solana/web3.js';
import { MintLayout } from '@solana/spl-token';
import { getPdaMetadataKey } from '@raydium-io/raydium-sdk';
import { MetadataAccountData, MetadataAccountDataArgs, getMetadataAccountDataSerializer } from '@metaplex-foundation/mpl-token-metadata';

import { solanaConnection } from "../../constants/constants"

/** Information about a mint */
export interface Mint {
    /** Address of the mint */
    address: PublicKey;
    /**
     * Optional authority used to mint new tokens. The mint authority may only be provided during mint creation.
     * If no mint authority is present then the mint has a fixed supply and no further tokens may be minted.
     */
    mintAuthority: PublicKey | null;
    /** Total supply of tokens */
    supply: bigint;
    /** Number of base 10 digits to the right of the decimal place */
    decimals: number;
    /** Is this mint initialized */
    isInitialized: boolean;
    /** Optional authority to freeze token accounts */
    freezeAuthority: PublicKey | null;
}


export async function checkMintable(vault: PublicKey): Promise<boolean | undefined> {
    try {
        let { data } = (await solanaConnection.getAccountInfo(vault)) || {}
        if (!data) {
            return
        }
        const deserialize = MintLayout.decode(data)
        return deserialize.mintAuthorityOption === 0
    } catch (e) {
        console.log(`Failed to check if mint is renounced`, vault)
    }
}


export const checkMutable = async (baseMint: PublicKey,) => {
    try {
        const metadataPDA = getPdaMetadataKey(baseMint);
        const metadataAccount = await solanaConnection.getAccountInfo(metadataPDA.publicKey);
        if (!metadataAccount?.data) {
            return { ok: false, message: 'Mutable -> Failed to fetch account data' };
        }
        const serializer = getMetadataAccountDataSerializer()
        const deserialize = serializer.deserialize(metadataAccount.data);
        const mutable = deserialize[0].isMutable;

        return !mutable
    } catch (e: any) {
        return false
    }
}
export const checkBurn = async (lpMint: PublicKey) => {
    try {
        const amount = await solanaConnection.getTokenSupply(lpMint, 'confirmed');
        const burned = amount.value.uiAmount === 0;
        return burned
    } catch (error) {
        return false
    }
}

export async function checkFreezeAuthority(mintPublicKey: PublicKey) {
    // Fetch the mint account info
    const mintAccountInfo = await solanaConnection.getAccountInfo(mintPublicKey);

    if (!mintAccountInfo) {
        throw new Error('Mint account not found');
    }

    // Parse the mint account data
    const mintData = parseMintAccountData(mintAccountInfo.data);
    console.log("🚀 ~ checkFreezeAuthority ~ mintData:", mintData)

    // Check if the freeze authority is set
    if (mintData.freezeAuthority) {
        console.log(`Freeze Authority: ${mintData.freezeAuthority.toBase58()}`);
        return true
    } else {
        return false
    }
}

export async function getFreezeAuthority(mint: PublicKey) {
    const mintAccountInfo = await solanaConnection.getAccountInfo(mint);
    if(!mintAccountInfo) return false
    const mintData = MintLayout.decode(mintAccountInfo.data);
    return mintData.freezeAuthorityOption === 1
  }


export const checkTicker = async (connection: Connection, baseMint: PublicKey, keyword: String) => {
    try {
      const serializer = getMetadataAccountDataSerializer()
      const metadataPDA = getPdaMetadataKey(baseMint);
      const metadataAccount = await connection.getAccountInfo(metadataPDA.publicKey, 'confirmed');
      if (!metadataAccount?.data) {
        return { ok: false, message: 'Mutable -> Failed to fetch account data' };
      }
  
      const deserialize = serializer.deserialize(metadataAccount.data);
      const response = await fetch(deserialize[0].uri);
      const data = await response.json();
      console.log("Token Symbol : ", `$${data.symbol}`);
      console.log("Token Name : ", `$${data.name}`);
      if (data.symbol.toUpperCase().indexOf(keyword.toUpperCase()) > -1 || data.name.toUpperCase().indexOf(keyword.toUpperCase()) > -1) {
        return true
      } else {
        return false
      }
    } catch (error) {
      return false
    }
  }

// Helper function to parse mint account data
function parseMintAccountData(data: Buffer) {
    // Mint account layout (simplified for this example)
    const mintLayout = {
        mintAuthorityOption: 0,
        mintAuthority: 1,
        supply: 9,
        decimals: 17,
        isInitialized: 18,
        freezeAuthorityOption: 19,
        freezeAuthority: 20,
    };

    const mintAuthorityOption = data.readUInt32LE(mintLayout.mintAuthorityOption);
    const freezeAuthorityOption = data.readUInt32LE(mintLayout.freezeAuthorityOption);

    return {
        mintAuthority: mintAuthorityOption ? new PublicKey(data.slice(mintLayout.mintAuthority, mintLayout.mintAuthority + 32)) : null,
        supply: data.readBigUInt64LE(mintLayout.supply),
        decimals: data[mintLayout.decimals],
        isInitialized: !!data[mintLayout.isInitialized],
        freezeAuthority: freezeAuthorityOption ? new PublicKey(data.slice(mintLayout.freezeAuthority, mintLayout.freezeAuthority + 32)) : null,
    };
}
