import { Connection } from "@solana/web3.js";
import { logger, retrieveEnvVariable } from "../utils"

export const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY', logger)
export const SECOND_WALLET = retrieveEnvVariable('SECOND_WALLET', logger)
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger)
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT', logger)

export const GRPC_ENDPOINT = retrieveEnvVariable('GRPC_ENDPOINT', logger);
export const GRPC_TOKEN = retrieveEnvVariable('GRPC_TOKEN', logger);

export const BUY_AMOUNT = Number(retrieveEnvVariable('BUY_AMOUNT', logger));
export const CHECK_IF_MINT_IS_FREEZABLE = retrieveEnvVariable('CHECK_IF_MINT_IS_FREEZABLE', logger) === 'true'
export const CHECK_IF_MINT_IS_MINTABLE = retrieveEnvVariable('CHECK_IF_MINT_IS_MINTABLE', logger) === 'true'
export const CHECK_IF_MINT_IS_BURNED = retrieveEnvVariable('CHECK_IF_MINT_IS_BURNED', logger) === 'true'

export const CHECK_MARKET_CAP = retrieveEnvVariable('CHECK_MARKET_CAP', logger) === 'true'
export const MINIMUM_MARKET_CAP = Number(retrieveEnvVariable('MINIMUM_MARKET_CAP', logger))
export const MAXIMUM_MARKET_CAP = Number(retrieveEnvVariable('MAXIMUM_MARKET_CAP', logger))

export const CHECK_LIQUIDITY = retrieveEnvVariable('CHECK_LIQUIDITY', logger) === 'true'
export const MINIMUM_LIQUIDITY = Number(retrieveEnvVariable('MINIMUM_LIQUIDITY', logger))
export const MAXIMUM_LIQUIDITY = Number(retrieveEnvVariable('MAXIMUM_LIQUIDITY', logger))

export const CHECK_KEYWORD = retrieveEnvVariable('CHECK_KEYWORD', logger) === 'true'
export const KEYWORD = retrieveEnvVariable('KEYWORD', logger);


// Fee configs
export const JITO_MODE = retrieveEnvVariable('JITO_MODE', logger) === 'true'
export const JITO_FEE = Number(retrieveEnvVariable('JITO_FEE', logger))

export const NEXTBLOCK_MODE = retrieveEnvVariable('NEXTBLOCK_MODE', logger) === 'true'
export const NEXT_BLOCK_API = retrieveEnvVariable('NEXT_BLOCK_API', logger)
export const NEXT_BLOCK_FEE = Number(retrieveEnvVariable('NEXT_BLOCK_FEE', logger))

export const BLOXROUTE_MODE = retrieveEnvVariable('BLOXROUTE_MODE', logger) === 'true'
export const BLOXROUTE_FEE = Number(retrieveEnvVariable('BLOXROUTE_FEE', logger))
export const BLOXROUTE_AUTH_HEADER = retrieveEnvVariable('BLOXROUTE_AUTH_HEADER', logger)

export const SLIPPAGE = Number(retrieveEnvVariable('SLIPPAGE', logger))
export const PRIORITY_FEE =  Number(retrieveEnvVariable('PRIORITY_FEE', logger))

export const PROGRAM_ID = "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB";
export const wsol = "So11111111111111111111111111111111111111112";
export const usdc = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const usdt =  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"; // USDT

export const solanaConnection = new Connection(RPC_ENDPOINT)