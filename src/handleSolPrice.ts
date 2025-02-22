import fs from 'fs';
import path from 'path';

const jsonFilePath = path.join(__dirname, 'solPrice.json');

interface SolPriceData {
    solPrice: number;
}

export async function fetchSolPrice(): Promise<void> {
    try {
        const response = await fetch(
            `https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112`
        );
        const data: any = await response.json();
        const solPrice: number = Number(data.data['So11111111111111111111111111111111111111112'].price);

        // Save the SOL price to a JSON file
        const solPriceData: SolPriceData = { solPrice };
        fs.writeFileSync(jsonFilePath, JSON.stringify(solPriceData));

    } catch (error) {
        console.error('Error fetching SOL price:', error);
    }
}

// Function to fetch and save SOL price every 2 seconds
export function startSolPricePolling(): void {
    setInterval(fetchSolPrice, 2000);
}

export function getSolPriceFromFile(): number | null {
    try {
        const data = fs.readFileSync(jsonFilePath, 'utf8');
        const { solPrice }: SolPriceData = JSON.parse(data);
        return solPrice;
    } catch (error) {
        console.error('Error reading SOL price from file:', error);
        return 0;
    }
}
