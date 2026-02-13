# 📦 Installation Guide - Referral System Fix

## Quick Install Commands

### Step 1: Backup Your Current Code
```bash
# Navigate to your project directory
cd ~/seeker-scratch-app  # or wherever your project is

# Create a backup
cp -r . ../seeker-scratch-app-backup
echo "✅ Backup created at ../seeker-scratch-app-backup"
```

### Step 2: Unzip and Apply Frontend Files
```bash
# Unzip the fixed files (replace path with your download location)
unzip ~/Downloads/seeker-scratch-FIXED.zip -d /tmp/referral-fix

# Copy the new hook
cp /tmp/referral-fix/src/app/hooks/useReferralMonitor.ts src/app/hooks/

# Copy the updated constants
cp /tmp/referral-fix/src/app/lib/constants.ts src/app/lib/

# Copy the updated page
cp /tmp/referral-fix/src/app/page.tsx src/app/

echo "✅ Frontend files updated!"
```

### Step 3: Test the Frontend Changes
```bash
# No new dependencies needed, just restart dev server
npm run dev

# Open http://localhost:3000
# Check browser console for: "👀 Starting referral monitor..."
```

---

## Smart Contract Update (100 Points)

⚠️ **IMPORTANT:** The frontend shows "100 pts" but the smart contract still awards 10 points until you redeploy.

### Option A: Update Smart Contract (Recommended for 100 pts)

You need to update your Rust smart contract to actually award 100 points:

```bash
# 1. Open your smart contract
# Edit: programs/seeker-scratch/src/lib.rs

# 2. Find this line (around line 17):
const POINTS_PER_SCRATCH: u64 = 10;

# 3. Add this line right after it:
const REFERRAL_POINTS: u64 = 100;

# 4. Find the award_referral_points function (around line 321)
# Replace these two lines:
let referrer_points = POINTS_PER_SCRATCH.checked_mul(multiplier)...
let referee_points = POINTS_PER_SCRATCH;

# With:
let referrer_points = REFERRAL_POINTS.checked_mul(multiplier)...
let referee_points = REFERRAL_POINTS;
```

### Option B: Use Solana Playground (Easier)

```bash
# 1. Go to: https://beta.solpg.io
# 2. Create new Anchor project
# 3. Replace lib.rs with the updated contract (provided in the zip)
# 4. Build & Deploy
# 5. Update PROGRAM_ID in src/app/lib/constants.ts with new address
```

### After Contract Update:

```bash
# Rebuild (if using local Anchor)
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Or deploy via Solana Playground and update Program ID
```

---

## One-Line Install (All Frontend Files)

```bash
# Extract directly to your project (run from project root)
unzip ~/Downloads/seeker-scratch-FIXED.zip -o

# Restart dev server
npm run dev
```

---

## Verification Commands

```bash
# Check if new files exist
ls -la src/app/hooks/useReferralMonitor.ts
# Should show: useReferralMonitor.ts exists

# Check if page.tsx was updated (should mention useReferralMonitor)
grep -n "useReferralMonitor" src/app/page.tsx
# Should show line numbers where it's imported and used

# Check if constants.ts has awardReferralPoints
grep -n "awardReferralPoints" src/app/lib/constants.ts
# Should show the new instruction definition
```

---

## Rollback (If Needed)

```bash
# Restore from backup
rm -rf src/app/hooks/useReferralMonitor.ts
cp -r ../seeker-scratch-app-backup/* .
npm run dev
```

---

## What Each File Does

**useReferralMonitor.ts** (NEW)
- Listens for ReferralQualified events from blockchain
- Automatically calls award_referral_points when detected
- Prevents duplicate awarding

**constants.ts** (MODIFIED)
- Added awardReferralPoints to IDL
- Required for frontend to call the instruction

**page.tsx** (MODIFIED)
- Imports and initializes useReferralMonitor
- Added "Referred Bonus: ✅ 100 pts" stat display

---

## Testing After Install

1. Open browser console (F12)
2. Check for: `👀 Starting referral monitor...`
3. Test with two wallets (see REFERRAL_FIX_README.md)
4. Verify 100 points are awarded (after contract update)

---

## Troubleshooting

**Files not found?**
```bash
# Make sure you're in the project root
pwd
# Should end with: /seeker-scratch-app

# Check zip contents
unzip -l ~/Downloads/seeker-scratch-FIXED.zip
```

**Permission denied?**
```bash
chmod +x ~/Downloads/seeker-scratch-FIXED.zip
```

**TypeScript errors?**
```bash
# Restart TypeScript server in VS Code
# Or restart dev server
npm run dev
```

---

## Deploy to Production

Once tested on devnet:

```bash
# 1. Update smart contract (if doing 100 pts)
anchor deploy --provider.cluster mainnet

# 2. Update PROGRAM_ID in constants.ts if needed

# 3. Push frontend to Vercel
git add .
git commit -m "Fix: Referral points auto-awarding + 100 pts bonus"
git push origin main

# Vercel will auto-deploy
```

---

## Summary

✅ **Frontend only** (shows "100 pts" but awards 10):
- Just unzip and restart dev server
- Works immediately on devnet

✅ **Full fix** (actually awards 100 pts):
- Unzip frontend files
- Update smart contract constant
- Redeploy contract
- Test and push to production
