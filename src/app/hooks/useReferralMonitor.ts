import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { useCallback, useEffect, useRef } from 'react'
import { PROGRAM_ID, PROFILE_SEED, IDL } from '../lib/constants'

/**
 * Monitor for ReferralQualified events and automatically award points
 */
export function useReferralMonitor() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const listenerIdRef = useRef<number | null>(null)
  const processedQualifications = useRef<Set<string>>(new Set())

  const getProvider = useCallback(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null
    return new AnchorProvider(
      connection,
      wallet as any,
      { commitment: 'confirmed' }
    )
  }, [connection, wallet])

  const getProgram = useCallback(() => {
    const provider = getProvider()
    if (!provider) return null
    return new Program(IDL as any, PROGRAM_ID, provider)
  }, [getProvider])

  const getProfilePda = useCallback((owner: PublicKey) => {
    const [pda] = PublicKey.findProgramAddressSync(
      [PROFILE_SEED, owner.toBuffer()],
      PROGRAM_ID
    )
    return pda
  }, [])

  const awardReferralPoints = useCallback(async (referrer: PublicKey, referee: PublicKey) => {
    const program = getProgram()
    if (!program) {
      console.log('❌ No program available for awarding points')
      return
    }

    try {
      const referrerProfilePda = getProfilePda(referrer)
      const refereeProfilePda = getProfilePda(referee)

      console.log('🎁 Awarding referral points...')
      console.log('   Referrer:', referrer.toString())
      console.log('   Referee:', referee.toString())

      // Call the award_referral_points instruction
      const tx = await (program.methods as any)
        .awardReferralPoints()
        .accounts({
          refereeProfile: refereeProfilePda,
          referrerProfile: referrerProfilePda,
        })
        .rpc({ commitment: 'confirmed' })

      console.log('✅ Referral points awarded! Tx:', tx)
    } catch (err: any) {
      console.error('❌ Failed to award referral points:', err)
      // Don't throw - we don't want to break the UI if this fails
      // User can contact support if points aren't awarded
    }
  }, [getProgram, getProfilePda])

  // Monitor for ReferralQualified events
  useEffect(() => {
    const program = getProgram()
    if (!program) return

    console.log('👀 Starting referral monitor...')

    // Listen for ReferralQualified events
    const listenerId = program.addEventListener('ReferralQualified', async (event: any) => {
      const referrer = event.referrer as PublicKey
      const referee = event.referee as PublicKey

      // Create unique key for this qualification
      const qualificationKey = `${referrer.toString()}-${referee.toString()}`

      // Check if we've already processed this
      if (processedQualifications.current.has(qualificationKey)) {
        console.log('⏭️ Already processed this qualification, skipping')
        return
      }

      console.log('🎉 ReferralQualified event detected!')
      console.log('   Referrer:', referrer.toString())
      console.log('   Referee:', referee.toString())

      // Mark as processed
      processedQualifications.current.add(qualificationKey)

      // Award points automatically
      await awardReferralPoints(referrer, referee)
    })

    listenerIdRef.current = listenerId

    return () => {
      if (listenerIdRef.current !== null) {
        console.log('🛑 Stopping referral monitor')
        program.removeEventListener(listenerIdRef.current)
      }
    }
  }, [getProgram, awardReferralPoints])

  return {
    awardReferralPoints, // Expose for manual awarding if needed
  }
}
