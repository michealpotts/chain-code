# SOUL Token Contract

A GalaChain contract for purchasing SOUL tokens with GALA tokens, featuring adjustable exchange rates and automatic fee distribution.

## Features

- **Token Purchase**: Buy SOUL tokens using GALA tokens
- **Dynamic Exchange Rate**: Admin can adjust the GALA:SOUL exchange rate
- **Automatic Fee Distribution**: 
  - 15% of GALA → Burned (sent to burn address)
  - 85% of GALA → Admin wallet
- **Admin Controls**: Set exchange rate, admin wallet, pause/resume purchases
- **Direct Minting**: Admin can mint SOUL tokens directly for rewards/airdrops

## Setup Instructions

### 1. Create SOUL Token Class

First, you need to create the SOUL token class using the `GalaChainTokenContract`:

```typescript
// Call CreateTokenClass on GalaChainTokenContract
{
  network: "mainnet", // or your network
  tokenClass: {
    category: "SOUL",
    collection: "GAME",
    type: "SOUL"
  },
  isNonFungible: false, // SOUL is fungible
  decimals: 18,
  name: "SOUL Token",
  symbol: "SOUL",
  description: "In-game currency for purchasing items and actions"
}
```

### 2. Configure SOUL Contract

After creating the token class, set it in the SoulContract:

```typescript
// Call SetSoulTokenClass with the token class key
// Format: "category:collection:type" or JSON object
SetSoulTokenClass({
  soulTokenClassKey: "SOUL:GAME:SOUL" // or full JSON
})
```

### 3. Set Admin Wallet

Configure the wallet that receives 85% of GALA:

```typescript
SetAdminWallet({
  newWallet: "eth|0x..." // Admin wallet address
})
```

## Usage

### User Functions

#### Buy SOUL with GALA

```typescript
BuySoulWithGala({
  buyerAddress: "eth|0x...",
  galaAmount: 1000, // Amount of GALA to spend
  galaTokenInstance: "category:collection:type:instance" // GALA token instance
})

// Returns:
// {
//   soulAmount: 10, // 1000 GALA / 100 rate = 10 SOUL
//   galaBurned: 150, // 15% of 1000
//   galaToAdmin: 850 // 85% of 1000
// }
```

#### Get SOUL Amount (View)

```typescript
GetSoulAmount({
  galaAmount: 1000
})

// Returns: 10 (SOUL amount for 1000 GALA at current rate)
```

### Admin Functions

#### Set Exchange Rate

```typescript
SetExchangeRate({
  newRate: 100 // 1 SOUL = 100 GALA
})
```

#### Set Admin Wallet

```typescript
SetAdminWallet({
  newWallet: "eth|0x..." // New admin wallet
})
```

#### Mint SOUL Directly

```typescript
MintSoul({
  to: "eth|0x...",
  amount: 1000 // Amount of SOUL to mint
})
```

#### Pause/Resume Purchases

```typescript
PausePurchases({
  paused: true // or false to resume
})
```

### View Functions

- `GetCurrentRate()` - Returns current exchange rate (GALA per SOUL)
- `GetAdminWallet()` - Returns admin wallet address
- `TotalGalaBurned()` - Returns total GALA burned (15% of all purchases)
- `TotalGalaCollected()` - Returns total GALA collected by admin (85% of all purchases)

## Exchange Rate Formula

```
SOUL_Amount = GALA_Paid / Current_Exchange_Rate
GALA_Burned = GALA_Paid × 15%
GALA_To_Admin = GALA_Paid × 85%
```

## Default Settings

- **Initial Exchange Rate**: 100 (1 SOUL = 100 GALA)
- **Burn Percentage**: 15%
- **Admin Percentage**: 85%
- **Decimals**: 18

## Events

The contract emits the following events:

- `SoulPurchased` - When a user buys SOUL tokens
- `ExchangeRateUpdated` - When admin changes exchange rate
- `AdminWalletUpdated` - When admin wallet is updated
- `SoulMinted` - When admin mints SOUL directly
- `PurchasesPaused` - When purchases are paused/resumed
- `SoulTokenClassSet` - When SOUL token class is configured

## Integration with Other Contracts

The SOUL contract can be called by other contracts (e.g., BreedingContract) to:
- Check SOUL balances
- Transfer SOUL tokens
- Spend SOUL on in-game actions

SOUL tokens are standard GalaChain tokens and can be used with all GalaChain token operations (transfer, lock, unlock, etc.).

