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

    pub fn buy_and_scratch(ctx: Context<BuyAndScratch>, card_type: CardType) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        require!(!treasury.paused, ScratchError::GamePaused);

        let profile = &mut ctx.accounts.profile;

        let cost: u64 = match card_type {
            CardType::QuickPick => 10_000_000,
            CardType::Lucky7s => 50_000_000,
            CardType::HotShot => 50_000_000,
            CardType::MegaGold => 100_000_000,
        };

        let actual_balance = treasury.to_account_info().lamports();
        require!(actual_balance >= MIN_TREASURY, ScratchError::TreasuryTooLow);

        // Calculate 3% house fee
        let house_fee = cost.checked_mul(HOUSE_FEE_BPS).ok_or(ScratchError::Overflow)?
            .checked_div(10000).ok_or(ScratchError::Overflow)?;
        let treasury_amount = cost.checked_sub(house_fee).ok_or(ScratchError::Overflow)?;

        // Send 3% to house wallet instantly
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

        // Send 97% to treasury
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

        let now = Clock::get()?.unix_timestamp;
        if now - treasury.day_start_time >= 86400 {
            treasury.daily_paid_out = 0;
            treasury.day_start_time = now;
        }

        let seed = now
            .checked_add(ctx.accounts.player.key().to_bytes()[0] as i64)
            .ok_or(ScratchError::Overflow)?
            .checked_add(treasury.total_cards_sold as i64)
            .ok_or(ScratchError::Overflow)?;

        let random = pseudo_random(seed as u64);

        let (win_threshold, max_payout) = match card_type {
            CardType::QuickPick => (1430, 100_000_000),
            CardType::Lucky7s => (2000, 500_000_000),
            CardType::HotShot => (1670, 1_000_000_000),
            CardType::MegaGold => (2000, 5_000_000_000),
        };

        let win_value = random % 10000;
        let won = win_value < win_threshold;

        if won {
            let prize_random = pseudo_random(seed.wrapping_add(12345) as u64);
            let prize = calculate_prize(&card_type, prize_random, max_payout);

            let available_for_payout = if treasury.balance > MIN_TREASURY {
                treasury.balance - MIN_TREASURY
            } else {
                0
            };

            let remaining_daily_cap = DAILY_PAYOUT_CAP.saturating_sub(treasury.daily_paid_out);
            let can_pay = available_for_payout.min(remaining_daily_cap);

            if prize <= can_pay {
                **treasury_info.try_borrow_mut_lamports()? -= prize;
                **ctx.accounts.player.to_account_info().try_borrow_mut_lamports()? += prize;

                treasury.balance = treasury.balance.checked_sub(prize).ok_or(ScratchError::Overflow)?;
                treasury.total_paid_out = treasury.total_paid_out.checked_add(prize).ok_or(ScratchError::Overflow)?;
                treasury.daily_paid_out = treasury.daily_paid_out.checked_add(prize).ok_or(ScratchError::Overflow)?;

                profile.total_won = profile.total_won.checked_add(prize).ok_or(ScratchError::Overflow)?;
                profile.wins = profile.wins.checked_add(1).ok_or(ScratchError::Overflow)?;
            }
        } else {
            treasury.total_profit = treasury.total_profit.checked_add(treasury_amount).ok_or(ScratchError::Overflow)?;
        }

        profile.cards_scratched = profile.cards_scratched.checked_add(1).ok_or(ScratchError::Overflow)?;
        profile.total_spent = profile.total_spent.checked_add(cost).ok_or(ScratchError::Overflow)?;

        let base_points = match card_type {
            CardType::QuickPick => 1,
            CardType::Lucky7s => 3,
            CardType::HotShot => 5,
            CardType::MegaGold => 10,
        };
        profile.points_this_month = profile.points_this_month.saturating_add(base_points);
        profile.points_all_time = profile.points_all_time.saturating_add(base_points);

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
            if value < 5000 { 15_000_000 }
            else if value < 7500 { 20_000_000 }
            else if value < 9000 { 30_000_000 }
            else if value < 9800 { 50_000_000 }
            else { 100_000_000 }
        },
        CardType::Lucky7s => {
            if value < 5000 { 60_000_000 }
            else if value < 7500 { 80_000_000 }
            else if value < 9000 { 100_000_000 }
            else if value < 9800 { 200_000_000 }
            else { 500_000_000 }
        },
        CardType::HotShot => {
            if value < 5000 { 60_000_000 }
            else if value < 7500 { 80_000_000 }
            else if value < 9000 { 150_000_000 }
            else if value < 9800 { 300_000_000 }
            else { 1_000_000_000 }
        },
        CardType::MegaGold => {
            if value < 5000 { 120_000_000 }
            else if value < 7500 { 300_000_000 }
            else if value < 9000 { 750_000_000 }
            else if value < 9800 { 1_500_000_000 }
            else { 5_000_000_000 }
        },
    }.min(max_payout)
}

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
    pub month_start: i64,        // 8  — must be present or bump reads wrong offset
    pub bump: u8,                // 1
    // Total data: 90 bytes + 8 discriminator = 98 bytes
}

#[account]
#[derive(Default)]
pub struct PlayerProfile {
    pub owner: Pubkey,
    pub display_name: String,
    pub pfp_url: String,
    pub points_this_month: u64,
    pub points_all_time: u64,
    pub cards_scratched: u32,
    pub total_spent: u64,
    pub total_won: u64,
    pub wins: u32,
    pub has_been_referred: bool,
    pub referred_by: Pubkey,
    pub referral_bonus_paid: bool,
    pub referrals_count: u32,
}

#[account]
pub struct MonthlyPrize {
    pub month: i64,
    pub winners: [Pubkey; 3],
    pub amounts: [u64; 3],
    pub paid: [bool; 3],
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CardType {
    QuickPick,
    Lucky7s,
    HotShot,
    MegaGold,
}

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
    /// CHECK: House wallet receives 3% fee
    #[account(mut, address = HOUSE.parse::<Pubkey>().unwrap())]
    pub house_wallet: AccountInfo<'info>,
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
}
