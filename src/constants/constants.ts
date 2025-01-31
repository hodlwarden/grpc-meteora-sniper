import { logger, retrieveEnvVariable } from "../utils"

export const PRIVATE_KEY = retrieveEnvVariable('PRIVATE_KEY', logger)
export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger)
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('RPC_WEBSOCKET_ENDPOINT', logger)

export const GRPC_ENDPOINT = retrieveEnvVariable('GRPC_ENDPOINT', logger);
export const GRPC_TOKEN = retrieveEnvVariable('GRPC_TOKEN', logger);

export const BUY_AMOUNT = Number(retrieveEnvVariable('BUY_AMOUNT', logger));

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
