# Incubator Contract

A GalaChain contract for incubating eggs and hatching creatures, with speed-up mechanics and user limits.

## Features

- **User Limits**: Each user can incubate up to 4 eggs simultaneously
- **Egg Validation**: Validates ownership, incubation status, and availability
- **Rarity-Based Timing**: Incubation duration varies by egg rarity
- **Speed-Up Mechanics**: Users can speed up incubation with GALA (3 tiers)
- **Automatic Fee Distribution**: 15% of GALA burned, 85% to admin
- **Creature Minting**: Automatically mints creature NFT when incubation completes

## Incubation Times by Rarity

- **COMMON**: 18 hours
- **UNCOMMON**: 24 hours
- **RARE**: 30 hours
- **ENHANCED**: 36 hours
- **ARCANE**: 48 hours
- **EPIC**: 60 hours
- **LEGENDARY**: 72 hours
- **MYSTIC**: 108 hours

## Speed-Up Tiers

- **TIER_1**: Reduce 1 hour for 100 GALA
- **TIER_2**: Reduce 4 hours for 300 GALA
- **TIER_3**: Reduce 8 hours for 500 GALA

## Setup Instructions

### 1. Create Creature Token Class

First, create the creature token class using `GalaChainTokenContract`:

```typescript
CreateTokenClass({
  network: "mainnet",
  tokenClass: {
    category: "CREATURE",
    collection: "GAME",
    type: "CREATURE"
  },
  isNonFungible: true, // Creatures are NFTs
  decimals: 0,
  name: "Game Creature",
  symbol: "CREATURE",
  description: "Hatched creatures from incubated eggs"
})
```

### 2. Configure Incubator Contract

Set the creature token class:

```typescript
SetCreatureTokenClass({
  creatureTokenClassKey: "CREATURE:GAME:CREATURE"
})
```

Set the contract address (for egg escrow):

```typescript
// This should be set in settings during initialization
// The contract address is where eggs are held during incubation
```

## Usage

### User Functions

#### Start Incubation

```typescript
StartIncubation({
  userId: "eth|0x...",
  eggId: "egg-123"
})

// Returns:
// {
//   sessionId: "eth|0x...:egg-123",
//   endTime: 1234567890000, // Unix timestamp
//   durationHours: 72 // Based on rarity
// }
```

**Validations:**
- User owns the egg
- Egg is not currently incubating
- User has available slot (< 4 active incubations)
- Egg is not already hatched

#### Speed Up Incubation

```typescript
SpeedUpIncubation({
  sessionId: "eth|0x...:egg-123",
  tier: "TIER_1", // or "TIER_2", "TIER_3"
  galaTokenInstance: "category:collection:type:instance"
})

// Returns:
// {
//   hoursReduced: 1,
//   newEndTime: 1234567890000,
//   remainingHours: 71
// }
```

#### Claim Creature

```typescript
ClaimCreature({
  sessionId: "eth|0x...:egg-123"
})

// Returns:
// {
//   creatureTokenInstance: "category:collection:type:instance"
// }
```

**Validations:**
- Incubation time has completed
- Egg is in contract escrow

**Actions:**
- Mints creature NFT to user
- Burns the egg
- Deletes the incubation session

### View Functions

#### Get Incubation Status

```typescript
GetIncubationStatus({
  sessionId: "eth|0x...:egg-123"
})

// Returns: IncubationSession object with all details
```

#### Get User Incubations

```typescript
GetUserIncubations({
  userId: "eth|0x..."
})

// Returns: Array of active IncubationSession objects
```

### Admin Functions

#### Set Creature Token Class

```typescript
SetCreatureTokenClass({
  creatureTokenClassKey: "CREATURE:GAME:CREATURE"
})
```

#### Pause/Resume Incubator

```typescript
PauseIncubator({
  paused: true // or false to resume
})
```

## Incubation Process Flow

1. **User starts incubation** → Egg transferred to contract (escrow)
2. **Timer starts** → Based on egg rarity
3. **User can speed up** → Multiple times with different tiers
4. **Timer completes** → User can claim creature
5. **Creature minted** → Egg burned, session deleted

## Fee Distribution

When users speed up incubation:
- **15% of GALA** → Burned (sent to burn address)
- **85% of GALA** → Admin wallet

## Events

The contract emits the following events:

- `IncubationStarted` - When user starts incubating an egg
- `IncubationSpedUp` - When user speeds up incubation
- `CreatureClaimed` - When user claims hatched creature
- `CreatureTokenClassSet` - When admin sets creature token class
- `IncubatorPaused` - When incubator is paused/resumed

## Integration Notes

- The contract interacts with `EggContract` to validate and transfer eggs
- Eggs are held in escrow (owned by contract) during incubation
- Creatures are minted as NFTs using the configured token class
- The contract tracks all active incubations per user (max 4)

