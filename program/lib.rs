use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("3vt5QCwqtn13ihaYoFk8RV7r7gbQMnbVcqSZdqNL6mKC");

const ADMIN: &str = "6RhLQikkjzace4ti4D458iSmKofbPdMGNB7VKHmWwYPP";
const HOUSE: &str = "DBH2VpbjWLdrJnau4RjdpYBTcLy9pMGa1qQr4U9dDgER";
const MIN_TREASURY: u64 = 5_000_000_000;
const DAILY_PAYOUT_CAP: u64 = 10_000_000_000;
const REFERRER_POINTS: u64 = 100;
const REFEREE_POINTS: u64 = 10;
const MIN_REFERRAL_SPEND: u64 = 100_000_000;
const HOUSE_FEE_BPS: u64 = 300; // 3%

#[program]
pub mod seeker_scratch {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        treasury.admin = ctx.accounts.admin.key();
        treasury.balance = 0;
        treasury.total_cards_sold = 0;
        treasury.total_paid_out = 0;
        treasury.total_profit = 0;
        treasury.daily_paid_out = 0;
        treasury.day_start_time = Clock::get()?.unix_timestamp;
        treasury.paused = false;
        treasury.bump = ctx.bumps.treasury;
        Ok(())
    }

    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        require!(amount > 0, ScratchError::InvalidAmount);
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.admin.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            amount,
        )?;
        let treasury = &mut ctx.accounts.treasury;
        treasury.balance = treasury.balance.checked_add(amount).ok_or(ScratchError::Overflow)?;
        Ok(())
    }

    pub fn register_referral(ctx: Context<RegisterReferral>) -> Result<()> {
        let referee_profile = &mut ctx.accounts.referee_profile;
        require!(
            ctx.accounts.referee.key() != ctx.accounts.referrer.key(),
            ScratchError::CannotReferSelf
        );
        require!(
            !referee_profile.has_been_referred,
            ScratchError::AlreadyReferred
        );
        referee_profile.has_been_referred = true;
        referee_profile.referred_by = ctx.accounts.referrer.key();
        referee_profile.referral_bonus_paid = false;
        Ok(())
    }

    pub fn initialize_master_config(ctx: Context<InitializeMasterConfig>) -> Result<()> {
        let mc = &mut ctx.accounts.master_config;
        mc.cost_quickpick = 10_000_000;
        mc.cost_hotshot = 50_000_000;
        mc.cost_megagold = 100_000_000;
        mc.threshold_quickpick = 3500;
        mc.threshold_hotshot = 1500;
        mc.threshold_megagold = 1200;
        mc.house_fee_bps = 300;
        mc.min_treasury = 5_000_000_000;
        mc.daily_payout_cap = 10_000_000_000;
        mc.prize_1st_sol = 250_000_000;
        mc.prize_2nd_sol = 150_000_000;
        mc.prize_3rd_sol = 50_000_000;
        mc.prize_1st_skr = 250;
        mc.prize_2nd_skr = 150;
        mc.prize_3rd_skr = 100;
        mc.sweep_1st_skr = 500;
        mc.sweep_2nd_skr = 250;
        mc.sweep_3rd_skr = 100;
        mc.free_play_cooldown_seconds = 86400;
        mc.quickpick_enabled = true;
        mc.hotshot_enabled = true;
        mc.megagold_enabled = true;
        mc.double_points_active = false;
        mc.banner_text = String::new();
        mc.banner_active = false;
        mc.bump = ctx.bumps.master_config;
        Ok(())
    }

    pub fn update_master_config(ctx: Context<UpdateMasterConfig>, args: MasterConfigArgs) -> Result<()> {
        require!(args.banner_text.len() <= 100, ScratchError::InvalidInput);
        let mc = &mut ctx.accounts.master_config;
        mc.cost_quickpick = args.cost_quickpick;
        mc.cost_hotshot = args.cost_hotshot;
        mc.cost_megagold = args.cost_megagold;
        mc.threshold_quickpick = args.threshold_quickpick;
        mc.threshold_hotshot = args.threshold_hotshot;
        mc.threshold_megagold = args.threshold_megagold;
        mc.house_fee_bps = args.house_fee_bps;
        mc.min_treasury = args.min_treasury;
        mc.daily_payout_cap = args.daily_payout_cap;
        mc.prize_1st_sol = args.prize_1st_sol;
        mc.prize_2nd_sol = args.prize_2nd_sol;
        mc.prize_3rd_sol = args.prize_3rd_sol;
        mc.prize_1st_skr = args.prize_1st_skr;
        mc.prize_2nd_skr = args.prize_2nd_skr;
        mc.prize_3rd_skr = args.prize_3rd_skr;
        mc.sweep_1st_skr = args.sweep_1st_skr;
        mc.sweep_2nd_skr = args.sweep_2nd_skr;
        mc.sweep_3rd_skr = args.sweep_3rd_skr;
        mc.free_play_cooldown_seconds = args.free_play_cooldown_seconds;
        mc.quickpick_enabled = args.quickpick_enabled;
        mc.hotshot_enabled = args.hotshot_enabled;
        mc.megagold_enabled = args.megagold_enabled;
        mc.double_points_active = args.double_points_active;
        mc.banner_text = args.banner_text;
        mc.banner_active = args.banner_active;
        Ok(())
    }

    pub fn buy_and_scratch(ctx: Context<BuyAndScratch>, card_type: CardType) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        require!(!treasury.paused, ScratchError::GamePaused);

        let profile = &mut ctx.accounts.profile;

        // Read MasterConfig — take priority over GameConfig and hardcoded constants
        let mc_data = ctx.accounts.master_config.try_borrow_data()?;
        let mc_opt: Option<MasterConfig> = if mc_data.len() >= 260 {
            MasterConfig::try_deserialize(&mut &mc_data[..]).ok()
        } else {
            None
        };
        drop(mc_data);

        // Card cost + enabled check
        let (cost, enabled) = match card_type {
            CardType::QuickPick => (
                mc_opt.as_ref().map(|mc| mc.cost_quickpick).unwrap_or(10_000_000),
                mc_opt.as_ref().map(|mc| mc.quickpick_enabled).unwrap_or(true),
            ),
            CardType::Lucky7s => (50_000_000u64, true),
            CardType::HotShot => (
                mc_opt.as_ref().map(|mc| mc.cost_hotshot).unwrap_or(50_000_000),
                mc_opt.as_ref().map(|mc| mc.hotshot_enabled).unwrap_or(true),
            ),
            CardType::MegaGold => (
                mc_opt.as_ref().map(|mc| mc.cost_megagold).unwrap_or(100_000_000),
                mc_opt.as_ref().map(|mc| mc.megagold_enabled).unwrap_or(true),
            ),
        };
        require!(enabled, ScratchError::CardDisabled);

        let house_fee_bps = mc_opt.as_ref().map(|mc| mc.house_fee_bps).unwrap_or(HOUSE_FEE_BPS);
        let min_treasury_amt = mc_opt.as_ref().map(|mc| mc.min_treasury).unwrap_or(MIN_TREASURY);
        let daily_cap = mc_opt.as_ref().map(|mc| mc.daily_payout_cap).unwrap_or(DAILY_PAYOUT_CAP);
        let double_points = mc_opt.as_ref().map(|mc| mc.double_points_active).unwrap_or(false);

        let actual_balance = treasury.to_account_info().lamports();
        require!(actual_balance >= min_treasury_amt, ScratchError::TreasuryTooLow);

        let house_fee = cost.checked_mul(house_fee_bps).ok_or(ScratchError::Overflow)?
            .checked_div(10000).ok_or(ScratchError::Overflow)?;
        let treasury_amount = cost.checked_sub(house_fee).ok_or(ScratchError::Overflow)?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: ctx.accounts.house_wallet.to_account_info(),
                },
            ),
            house_fee,
        )?;

        let treasury_info = treasury.to_account_info();
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.player.to_account_info(),
                    to: treasury_info.clone(),
                },
            ),
            treasury_amount,
        )?;

        treasury.balance = treasury.balance.checked_add(treasury_amount).ok_or(ScratchError::Overflow)?;
        treasury.total_cards_sold = treasury.total_cards_sold.checked_add(1).ok_or(ScratchError::Overflow)?;

        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        if now - treasury.day_start_time >= 86400 {
            treasury.daily_paid_out = 0;
            treasury.day_start_time = now;
        }

        let seed = (now as u64)
            .wrapping_add(ctx.accounts.player.key().to_bytes()[0] as u64)
            .wrapping_add(ctx.accounts.player.key().to_bytes()[31] as u64)
            .wrapping_add(treasury.total_cards_sold as u64)
            .wrapping_add(clock.slot)
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);

        let random = pseudo_random(seed);

        // Win thresholds: MasterConfig > GameConfig > hardcoded
        let (win_threshold_qp, win_threshold_hs, win_threshold_mg) =
            if let Some(mc) = mc_opt.as_ref() {
                (mc.threshold_quickpick as u64, mc.threshold_hotshot as u64, mc.threshold_megagold as u64)
            } else {
                let gc_data = ctx.accounts.game_config.try_borrow_data()?;
                let result = if gc_data.len() >= 8 + 2 + 2 + 2 + 1 {
                    let qp = u16::from_le_bytes([gc_data[8], gc_data[9]]) as u64;
                    let hs = u16::from_le_bytes([gc_data[10], gc_data[11]]) as u64;
                    let mg = u16::from_le_bytes([gc_data[12], gc_data[13]]) as u64;
                    if qp > 0 && qp <= 10000 && hs > 0 && hs <= 10000 && mg > 0 && mg <= 10000 {
                        (qp, hs, mg)
                    } else {
                        (3500u64, 1500u64, 1200u64)
                    }
                } else {
                    (3500u64, 1500u64, 1200u64)
                };
                drop(gc_data);
                result
            };

        let (win_threshold, max_payout) = match card_type {
            CardType::QuickPick => (win_threshold_qp, 150_000_000u64),
            CardType::Lucky7s  => (2000u64,           500_000_000u64),
            CardType::HotShot  => (win_threshold_hs, 2_000_000_000u64),
            CardType::MegaGold => (win_threshold_mg, 5_000_000_000u64),
        };

        let win_value = random % 10000;
        let won = win_value < win_threshold;

        if won {
            let prize_random = pseudo_random(seed.wrapping_add(12345));
            let prize = calculate_prize(&card_type, prize_random, max_payout);

            let available_for_payout = if treasury.balance > min_treasury_amt {
                treasury.balance - min_treasury_amt
            } else {
                0
            };

            let remaining_daily_cap = daily_cap.saturating_sub(treasury.daily_paid_out);
            let can_pay = available_for_payout.min(remaining_daily_cap);

            require!(prize <= can_pay, ScratchError::TreasuryTooLow);

            **treasury_info.try_borrow_mut_lamports()? -= prize;
            **ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += prize;

            treasury.balance = treasury.balance.checked_sub(prize).ok_or(ScratchError::Overflow)?;
            treasury.total_paid_out = treasury.total_paid_out.checked_add(prize).ok_or(ScratchError::Overflow)?;
            treasury.daily_paid_out = treasury.daily_paid_out.checked_add(prize).ok_or(ScratchError::Overflow)?;

            profile.total_won = profile.total_won.checked_add(prize).ok_or(ScratchError::Overflow)?;
            profile.wins = profile.wins.checked_add(1).ok_or(ScratchError::Overflow)?;
        } else {
            treasury.total_profit = treasury.total_profit.checked_add(treasury_amount).ok_or(ScratchError::Overflow)?;
        }

        profile.cards_scratched = profile.cards_scratched.checked_add(1).ok_or(ScratchError::Overflow)?;
        profile.total_spent = profile.total_spent.checked_add(cost).ok_or(ScratchError::Overflow)?;

        let base_points: u64 = match card_type {
            CardType::QuickPick => 1,
            CardType::Lucky7s => 3,
            CardType::HotShot => 5,
            CardType::MegaGold => 10,
        };
        let final_points = if double_points { base_points.saturating_mul(2) } else { base_points };
        profile.points_this_month = profile.points_this_month.saturating_add(final_points);
        profile.points_all_time = profile.points_all_time.saturating_add(final_points);

        if profile.has_been_referred
            && !profile.referral_bonus_paid
            && profile.total_spent >= MIN_REFERRAL_SPEND
        {
            profile.referral_bonus_paid = true;
            profile.points_this_month = profile.points_this_month.saturating_add(REFEREE_POINTS);
            profile.points_all_time = profile.points_all_time.saturating_add(REFEREE_POINTS);
        }

        Ok(())
    }

    pub fn free_scratch(ctx: Context<FreeScratch>) -> Result<()> {
        let treasury = &ctx.accounts.treasury;
        require!(!treasury.paused, ScratchError::GamePaused);

        let profile = &mut ctx.accounts.profile;
        let clock = Clock::get()?;
        let now = clock.unix_timestamp;

        // Read MasterConfig for cooldown + threshold + double points
        let (cooldown_seconds, win_threshold, double_points) = {
            let mc_data = ctx.accounts.master_config.try_borrow_data()?;
            let result = if mc_data.len() >= 260 {
                match MasterConfig::try_deserialize(&mut &mc_data[..]) {
                    Ok(mc) => (mc.free_play_cooldown_seconds, mc.threshold_quickpick as u64, mc.double_points_active),
                    Err(_) => (86400i64, 3500u64, false),
                }
            } else {
                (86400i64, 3500u64, false)
            };
            drop(mc_data);
            result
        };

        // Enforce cooldown
        if profile.last_free_play_timestamp > 0 {
            let elapsed = now.saturating_sub(profile.last_free_play_timestamp);
            require!(elapsed >= cooldown_seconds, ScratchError::FreePlayNotReady);
        }

        // Randomness — uses player key + slot + free_plays_used for uniqueness
        let seed = (now as u64)
            .wrapping_add(profile.free_plays_used as u64)
            .wrapping_add(clock.slot)
            .wrapping_add(ctx.accounts.player.key().to_bytes()[0] as u64)
            .wrapping_add(ctx.accounts.player.key().to_bytes()[31] as u64)
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);

        let random = pseudo_random(seed);
        let win_value = random % 10000;
        let won = win_value < win_threshold;

        let mut sweep_points: u64 = if won {
            let tier_value = pseudo_random(seed.wrapping_add(12345)) % 10000;
            if tier_value < 6000 { 10 }        // common  — matches 0.012 SOL QP tier
            else if tier_value < 8500 { 25 }   // uncommon — matches 0.020 SOL tier
            else if tier_value < 9500 { 50 }   // rare     — matches 0.040 SOL tier
            else if tier_value < 9900 { 100 }  // epic     — matches 0.080 SOL tier
            else { 250 }                        // legendary — matches 0.150 SOL tier
        } else {
            1 // consolation point for playing
        };

        if double_points {
            sweep_points = sweep_points.saturating_mul(2);
        }

        profile.sweep_points_this_month = profile.sweep_points_this_month.saturating_add(sweep_points);
        profile.sweep_points_all_time = profile.sweep_points_all_time.saturating_add(sweep_points);
        profile.free_plays_used = profile.free_plays_used.saturating_add(1);
        if won {
            profile.free_play_wins = profile.free_play_wins.saturating_add(1);
        }
        profile.last_free_play_timestamp = now;

        msg!("free_scratch: won={} sweep_points={}", won, sweep_points);

        Ok(())
    }

    pub fn update_win_thresholds(ctx: Context<UpdateWinThresholds>, quickpick: u16, hotshot: u16, megagold: u16) -> Result<()> {
        let gc = &mut ctx.accounts.game_config;
        gc.win_threshold_quickpick = quickpick;
        gc.win_threshold_hotshot = hotshot;
        gc.win_threshold_megagold = megagold;
        gc.bump = ctx.bumps.game_config;
        Ok(())
    }

    pub fn update_profile(ctx: Context<UpdateProfile>, name: Option<String>, pfp_url: Option<String>) -> Result<()> {
        let profile = &mut ctx.accounts.profile;
        if let Some(n) = name {
            require!(n.len() <= 16, ScratchError::NameTooLong);
            profile.display_name = n;
        }
        if let Some(url) = pfp_url {
            require!(url.len() <= 128, ScratchError::PfpTooLong);
            profile.pfp_url = url;
        }
        Ok(())
    }

    pub fn credit_referrer(ctx: Context<CreditReferrer>) -> Result<()> {
        let referrer = &mut ctx.accounts.referrer_profile;
        referrer.points_this_month = referrer.points_this_month.saturating_add(REFERRER_POINTS);
        referrer.points_all_time = referrer.points_all_time.saturating_add(REFERRER_POINTS);
        referrer.referrals_count = referrer.referrals_count.checked_add(1).ok_or(ScratchError::Overflow)?;
        Ok(())
    }

    pub fn set_monthly_winners(
        ctx: Context<SetMonthlyWinners>,
        winners: [Pubkey; 3],
        amounts: [u64; 3],
    ) -> Result<()> {
        let prize = &mut ctx.accounts.monthly_prize;
        prize.month = Clock::get()?.unix_timestamp;
        prize.winners = winners;
        prize.amounts = amounts;
        prize.paid = [false; 3];
        prize.bump = ctx.bumps.monthly_prize;
        Ok(())
    }

    pub fn claim_monthly_prize(ctx: Context<ClaimMonthlyPrize>) -> Result<()> {
        let prize = &mut ctx.accounts.monthly_prize;
        let treasury = &mut ctx.accounts.treasury;
        let claimant = ctx.accounts.claimant.key();

        let idx = prize.winners.iter().position(|w| *w == claimant)
            .ok_or(ScratchError::NotAWinner)?;

        require!(!prize.paid[idx], ScratchError::AlreadyClaimed);

        let amount = prize.amounts[idx];
        require!(
            treasury.to_account_info().lamports() >= amount + MIN_TREASURY,
            ScratchError::TreasuryTooLow
        );

        **treasury.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.claimant.to_account_info().try_borrow_mut_lamports()? += amount;

        treasury.balance = treasury.balance.checked_sub(amount).ok_or(ScratchError::Overflow)?;
        prize.paid[idx] = true;
        Ok(())
    }

    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        ctx.accounts.treasury.paused = paused;
        Ok(())
    }

    pub fn withdraw_profit(ctx: Context<WithdrawProfit>, amount: u64) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        require!(amount > 0, ScratchError::InvalidAmount);
        require!(
            treasury.balance >= amount + MIN_TREASURY,
            ScratchError::WithdrawWouldBreakMinimum
        );
        let treasury_info = treasury.to_account_info();
        **treasury_info.try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.admin.to_account_info().try_borrow_mut_lamports()? += amount;
        treasury.balance = treasury.balance.checked_sub(amount).ok_or(ScratchError::Overflow)?;
        Ok(())
    }

    /// Admin-only: manually add points to any player profile (support/compensation tool).
    /// Set add_referral=true to also increment referrals_count by 1 (fixes missed referral credits).
    pub fn admin_adjust_points(ctx: Context<AdminAdjustPoints>, points: u64, add_referral: bool) -> Result<()> {
        let profile = &mut ctx.accounts.player_profile;
        profile.points_this_month = profile.points_this_month.saturating_add(points);
        profile.points_all_time = profile.points_all_time.saturating_add(points);
        if add_referral {
            profile.referrals_count = profile.referrals_count.checked_add(1).ok_or(ScratchError::Overflow)?;
        }
        Ok(())
    }
}

fn pseudo_random(seed: u64) -> u64 {
    let mut x = seed;
    x ^= x << 13;
    x ^= x >> 7;
    x ^= x << 17;
    x
}

fn calculate_prize(card_type: &CardType, random: u64, max_payout: u64) -> u64 {
    let value = random % 10000;
    match card_type {
        CardType::QuickPick => {
            if value < 6000 { 12_000_000 }
            else if value < 8500 { 20_000_000 }
            else if value < 9500 { 40_000_000 }
            else if value < 9900 { 80_000_000 }
            else { 150_000_000 }
        },
        CardType::Lucky7s => {
            if value < 5000 { 60_000_000 }
            else if value < 7500 { 80_000_000 }
            else if value < 9000 { 100_000_000 }
            else if value < 9800 { 200_000_000 }
            else { 500_000_000 }
        },
        CardType::HotShot => {
            if value < 5000 { 100_000_000 }
            else if value < 7500 { 200_000_000 }
            else if value < 9000 { 500_000_000 }
            else if value < 9800 { 1_000_000_000 }
            else { 2_000_000_000 }
        },
        CardType::MegaGold => {
            if value < 5000 { 200_000_000 }
            else if value < 7500 { 500_000_000 }
            else if value < 9000 { 1_000_000_000 }
            else if value < 9800 { 2_500_000_000 }
            else { 5_000_000_000 }
        },
    }.min(max_payout)
}

// ─── Account Structs ───────────────────────────────────────────────────────

#[account]
pub struct Treasury {
    pub admin: Pubkey,           // 32
    pub balance: u64,            // 8
    pub total_cards_sold: u64,   // 8
    pub total_paid_out: u64,     // 8
    pub total_profit: u64,       // 8
    pub daily_paid_out: u64,     // 8
    pub day_start_time: i64,     // 8
    pub paused: bool,            // 1
    pub month_start: i64,        // 8  — present to keep bump at correct offset
    pub bump: u8,                // 1
    // Total data: 90 bytes + 8 discriminator = 98 bytes
}

#[account]
#[derive(Default)]
pub struct PlayerProfile {
    pub owner: Pubkey,              // 32
    pub display_name: String,       // 4 + 16 = 20
    pub pfp_url: String,            // 4 + 128 = 132
    pub points_this_month: u64,     // 8
    pub points_all_time: u64,       // 8
    pub cards_scratched: u32,       // 4
    pub total_spent: u64,           // 8
    pub total_won: u64,             // 8
    pub wins: u32,                  // 4
    pub has_been_referred: bool,    // 1
    pub referred_by: Pubkey,        // 32
    pub referral_bonus_paid: bool,  // 1
    pub referrals_count: u32,       // 4
    pub last_win_slot: u64,         // 8
    // ─── Free play + sweep (32 bytes — fits within existing 310-byte allocation) ───
    pub last_free_play_timestamp: i64,  // 8
    pub sweep_points_this_month: u64,   // 8
    pub sweep_points_all_time: u64,     // 8
    pub free_plays_used: u32,           // 4
    pub free_play_wins: u32,            // 4
    // Total data: 302 bytes + 8 discriminator = 310 bytes — fits existing on-chain accounts exactly
    // NOTE: profile_bonus_claimed omitted — adding it = 303 bytes, overflows old 310-byte accounts
}

#[account]
pub struct GameConfig {
    pub win_threshold_quickpick: u16,  // 2
    pub win_threshold_hotshot: u16,    // 2
    pub win_threshold_megagold: u16,   // 2
    pub bump: u8,                      // 1
}

// MasterConfig space = 8 disc + 24 costs + 6 thresholds + 8 fee + 8 min_t + 8 daily_cap
//   + 24 sol prizes + 24 skr prizes + 24 sweep prizes + 8 cooldown
//   + 4 bools + 104 banner_text + 1 banner_active + 1 bump = 252 → allocate 260
#[account]
pub struct MasterConfig {
    pub cost_quickpick: u64,              // 8
    pub cost_hotshot: u64,                // 8
    pub cost_megagold: u64,               // 8
    pub threshold_quickpick: u16,         // 2
    pub threshold_hotshot: u16,           // 2
    pub threshold_megagold: u16,          // 2
    pub house_fee_bps: u64,               // 8
    pub min_treasury: u64,                // 8
    pub daily_payout_cap: u64,            // 8
    pub prize_1st_sol: u64,               // 8
    pub prize_2nd_sol: u64,               // 8
    pub prize_3rd_sol: u64,               // 8
    pub prize_1st_skr: u64,               // 8
    pub prize_2nd_skr: u64,               // 8
    pub prize_3rd_skr: u64,               // 8
    pub sweep_1st_skr: u64,               // 8
    pub sweep_2nd_skr: u64,               // 8
    pub sweep_3rd_skr: u64,               // 8
    pub free_play_cooldown_seconds: i64,  // 8
    pub quickpick_enabled: bool,          // 1
    pub hotshot_enabled: bool,            // 1
    pub megagold_enabled: bool,           // 1
    pub double_points_active: bool,       // 1
    pub banner_text: String,              // 4 + 100 = 104
    pub banner_active: bool,              // 1
    pub bump: u8,                         // 1
}

#[account]
pub struct MonthlyPrize {
    pub month: i64,
    pub winners: [Pubkey; 3],
    pub amounts: [u64; 3],
    pub paid: [bool; 3],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MasterConfigArgs {
    pub cost_quickpick: u64,
    pub cost_hotshot: u64,
    pub cost_megagold: u64,
    pub threshold_quickpick: u16,
    pub threshold_hotshot: u16,
    pub threshold_megagold: u16,
    pub house_fee_bps: u64,
    pub min_treasury: u64,
    pub daily_payout_cap: u64,
    pub prize_1st_sol: u64,
    pub prize_2nd_sol: u64,
    pub prize_3rd_sol: u64,
    pub prize_1st_skr: u64,
    pub prize_2nd_skr: u64,
    pub prize_3rd_skr: u64,
    pub sweep_1st_skr: u64,
    pub sweep_2nd_skr: u64,
    pub sweep_3rd_skr: u64,
    pub free_play_cooldown_seconds: i64,
    pub quickpick_enabled: bool,
    pub hotshot_enabled: bool,
    pub megagold_enabled: bool,
    pub double_points_active: bool,
    pub banner_text: String,
    pub banner_active: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CardType {
    QuickPick,
    Lucky7s,
    HotShot,
    MegaGold,
}

// ─── Contexts ──────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 1,
        seeds = [b"scratch_treasury_v2"],
        bump
    )]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, address = ADMIN.parse::<Pubkey>().unwrap())]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    #[account(mut, seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, address = treasury.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterReferral<'info> {
    #[account(
        init_if_needed,
        payer = referee,
        space = 310,
        seeds = [b"scratch_profile", referee.key().as_ref()],
        bump
    )]
    pub referee_profile: Account<'info, PlayerProfile>,
    #[account(mut)]
    pub referee: Signer<'info>,
    /// CHECK: Only used to store the referrer's pubkey
    pub referrer: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeMasterConfig<'info> {
    #[account(
        init_if_needed,
        payer = admin,
        space = 260,
        seeds = [b"master_config"],
        bump
    )]
    pub master_config: Account<'info, MasterConfig>,
    #[account(seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, address = treasury.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateMasterConfig<'info> {
    #[account(
        init_if_needed,
        payer = admin,
        space = 260,
        seeds = [b"master_config"],
        bump
    )]
    pub master_config: Account<'info, MasterConfig>,
    #[account(seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, address = treasury.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyAndScratch<'info> {
    #[account(mut, seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(
        init_if_needed,
        payer = player,
        space = 310,
        seeds = [b"scratch_profile", player.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, PlayerProfile>,
    /// CHECK: May be uninitialized if player has no referrer
    #[account(mut)]
    pub referrer_profile: UncheckedAccount<'info>,
    /// CHECK: GameConfig PDA — may be uninitialized; fallback to hardcoded defaults if absent
    pub game_config: UncheckedAccount<'info>,
    /// CHECK: MasterConfig PDA — may be uninitialized; takes priority over GameConfig
    pub master_config: UncheckedAccount<'info>,
    /// CHECK: House wallet receives fee
    #[account(mut, address = HOUSE.parse::<Pubkey>().unwrap())]
    pub house_wallet: AccountInfo<'info>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FreeScratch<'info> {
    #[account(seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(
        init_if_needed,
        payer = player,
        space = 310,
        seeds = [b"scratch_profile", player.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, PlayerProfile>,
    /// CHECK: MasterConfig PDA — may be uninitialized
    pub master_config: UncheckedAccount<'info>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProfile<'info> {
    #[account(mut, seeds = [b"scratch_profile", player.key().as_ref()], bump)]
    pub profile: Account<'info, PlayerProfile>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreditReferrer<'info> {
    #[account(
        mut,
        seeds = [b"scratch_profile", referrer_key.key().as_ref()],
        bump
    )]
    pub referrer_profile: Account<'info, PlayerProfile>,
    /// CHECK: Used as seed for referrer PDA
    pub referrer_key: AccountInfo<'info>,
    #[account(
        seeds = [b"scratch_profile", caller.key().as_ref()],
        bump,
        constraint = caller_profile.has_been_referred @ ScratchError::InvalidReferral,
        constraint = caller_profile.referral_bonus_paid @ ScratchError::InvalidReferral,
        constraint = caller_profile.referred_by == referrer_key.key() @ ScratchError::InvalidReferral,
    )]
    pub caller_profile: Account<'info, PlayerProfile>,
    #[account(mut)]
    pub caller: Signer<'info>,
}

#[derive(Accounts)]
pub struct SetMonthlyWinners<'info> {
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + 8 + 32*3 + 8*3 + 3 + 1,
        seeds = [b"monthly_prize"],
        bump
    )]
    pub monthly_prize: Account<'info, MonthlyPrize>,
    #[account(mut, seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, address = treasury.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimMonthlyPrize<'info> {
    #[account(mut, seeds = [b"monthly_prize"], bump = monthly_prize.bump)]
    pub monthly_prize: Account<'info, MonthlyPrize>,
    #[account(mut, seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut)]
    pub claimant: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateWinThresholds<'info> {
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + 2 + 2 + 2 + 1,
        seeds = [b"game_config"],
        bump
    )]
    pub game_config: Account<'info, GameConfig>,
    #[account(seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, address = treasury.admin)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(mut, seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, address = treasury.admin)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct WithdrawProfit<'info> {
    #[account(mut, seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, address = treasury.admin)]
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct AdminAdjustPoints<'info> {
    #[account(
        mut,
        seeds = [b"scratch_profile", player_key.key().as_ref()],
        bump
    )]
    pub player_profile: Account<'info, PlayerProfile>,
    /// CHECK: Used as PDA seed for the profile to adjust
    pub player_key: AccountInfo<'info>,
    #[account(seeds = [b"scratch_treasury_v2"], bump = treasury.bump)]
    pub treasury: Account<'info, Treasury>,
    #[account(mut, address = treasury.admin)]
    pub admin: Signer<'info>,
}

// ─── Errors ────────────────────────────────────────────────────────────────

#[error_code]
pub enum ScratchError {
    #[msg("Game is currently paused")]
    GamePaused,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Treasury balance too low")]
    TreasuryTooLow,
    #[msg("Withdraw would break minimum treasury requirement")]
    WithdrawWouldBreakMinimum,
    #[msg("Name too long (max 16 characters)")]
    NameTooLong,
    #[msg("PFP URL too long (max 128 characters)")]
    PfpTooLong,
    #[msg("Cannot refer yourself")]
    CannotReferSelf,
    #[msg("Already been referred")]
    AlreadyReferred,
    #[msg("Invalid referral credit attempt")]
    InvalidReferral,
    #[msg("Invalid input")]
    InvalidInput,
    #[msg("Not a monthly winner")]
    NotAWinner,
    #[msg("Prize already claimed")]
    AlreadyClaimed,
    #[msg("This card type is currently disabled")]
    CardDisabled,
    #[msg("Free play not available yet, come back later")]
    FreePlayNotReady,
}
