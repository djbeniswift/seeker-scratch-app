# Smart Contract Changes for 100 Referral Points

## Changes Required

You need to modify your Rust smart contract in TWO places:

### Change 1: Add REFERRAL_POINTS Constant

**File:** `programs/seeker-scratch/src/lib.rs`  
**Location:** Around line 17 (in the CONSTANTS section)

```rust
const DAILY_CAP_PERCENT: u64 = 20;
const MIN_TREASURY_QUICKPICK: u64 = 500_000_000;
const MIN_TREASURY_LUCKY7: u64 = 1_000_000_000;
const MIN_TREASURY_HOTSHOT: u64 = 2_000_000_000;
const MIN_TREASURY_MEGA: u64 = 5_000_000_000;
const POINTS_PER_SCRATCH: u64 = 10;
const REFERRAL_POINTS: u64 = 100;  // ⭐ ADD THIS LINE
const SECONDS_PER_DAY: i64 = 86400;
const MAX_NAME_LENGTH: usize = 16;
const MAX_PFP_LENGTH: usize = 128;
```

### Change 2: Update award_referral_points Function

**File:** `programs/seeker-scratch/src/lib.rs`  
**Location:** Around line 321-340 (in the award_referral_points function)

**BEFORE (10 points):**
```rust
let referrer_points = POINTS_PER_SCRATCH
    .checked_mul(multiplier)
    .ok_or(ScratchError::Overflow)?;
let referee_points = POINTS_PER_SCRATCH;
```

**AFTER (100 points):**
```rust
let referrer_points = REFERRAL_POINTS
    .checked_mul(multiplier)
    .ok_or(ScratchError::Overflow)?;
let referee_points = REFERRAL_POINTS;
```

---

## Complete Function (After Changes)

```rust
pub fn award_referral_points(ctx: Context<AwardReferralPoints>) -> Result<()> {
    let referee_profile = &ctx.accounts.referee_profile;

    require!(
        referee_profile.total_spent >= 100_000_000,
        ScratchError::ReferralNotQualified
    );

    let referrer_owner = ctx.accounts.referrer_profile.owner;
    let referee_owner = ctx.accounts.referee_profile.owner;
    let multiplier = get_nft_multiplier_from_cache(
        ctx.accounts.referrer_profile.bonus_nft,
        ctx.accounts.referrer_profile.nft_multiplier_cache,
    );

    // ⭐ CHANGED: Use REFERRAL_POINTS (100) instead of POINTS_PER_SCRATCH (10)
    let referrer_points = REFERRAL_POINTS
        .checked_mul(multiplier)
        .ok_or(ScratchError::Overflow)?;
    let referee_points = REFERRAL_POINTS;

    let referrer_profile = &mut ctx.accounts.referrer_profile;
    referrer_profile.points_this_month = referrer_profile.points_this_month
        .checked_add(referrer_points)
        .ok_or(ScratchError::Overflow)?;
    referrer_profile.points_all_time = referrer_profile.points_all_time
        .checked_add(referrer_points)
        .ok_or(ScratchError::Overflow)?;
    referrer_profile.referrals_count = referrer_profile.referrals_count
        .checked_add(1)
        .ok_or(ScratchError::Overflow)?;

    let referee_profile_mut = &mut ctx.accounts.referee_profile;
    referee_profile_mut.points_this_month = referee_profile_mut.points_this_month
        .checked_add(referee_points)
        .ok_or(ScratchError::Overflow)?;
    referee_profile_mut.points_all_time = referee_profile_mut.points_all_time
        .checked_add(referee_points)
        .ok_or(ScratchError::Overflow)?;

    emit!(ReferralPointsAwarded {
        referrer: referrer_owner,
        referee: referee_owner,
        referrer_points,
        referee_points,
        multiplier,
    });

    Ok(())
}
```

---

## How to Apply

### Method 1: Edit Locally

```bash
# 1. Open your smart contract
code programs/seeker-scratch/src/lib.rs

# 2. Make the two changes above
# 3. Save the file

# 4. Rebuild
anchor build

# 5. Deploy to devnet
anchor deploy --provider.cluster devnet

# 6. Deploy to mainnet when ready
anchor deploy --provider.cluster mainnet
```

### Method 2: Use Solana Playground

```
1. Go to: https://beta.solpg.io
2. Import your project or create new Anchor project
3. Replace lib.rs content with your file
4. Make the two changes above
5. Click "Build" (Ctrl+S)
6. Click "Deploy" and select devnet
7. Copy the new Program ID
8. Update src/app/lib/constants.ts with new Program ID
```

---

## After Deployment

Update your frontend constants:

```typescript
// src/app/lib/constants.ts
export const PROGRAM_ID = new PublicKey('YOUR_NEW_PROGRAM_ID_HERE')
```

---

## Testing

After deploying:

1. Test with two wallets
2. Referee spends 0.1 SOL
3. Check console for successful award transaction
4. Verify both wallets got 100 points (not 10)
5. Check on Solana Explorer to confirm

---

## Note

⚠️ **Until you redeploy the contract**, the system will:
- ✅ Show "100 pts" in the UI
- ❌ Actually award only 10 points on-chain

The UI change is cosmetic. For true 100-point rewards, you **must** update and redeploy the smart contract.
