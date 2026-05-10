export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          asset: string | null
          condition_id: string | null
          event_slug: string | null
          id: number
          outcome: string | null
          outcome_index: number | null
          price: number | null
          raw: Json
          side: string | null
          size: number | null
          slug: string | null
          timestamp: number
          title: string | null
          transaction_hash: string
          ts: string | null
          type: string
          usdc_size: number | null
          wallet_address: string
        }
        Insert: {
          asset?: string | null
          condition_id?: string | null
          event_slug?: string | null
          id?: number
          outcome?: string | null
          outcome_index?: number | null
          price?: number | null
          raw: Json
          side?: string | null
          size?: number | null
          slug?: string | null
          timestamp: number
          title?: string | null
          transaction_hash: string
          ts?: string | null
          type: string
          usdc_size?: number | null
          wallet_address: string
        }
        Update: {
          asset?: string | null
          condition_id?: string | null
          event_slug?: string | null
          id?: number
          outcome?: string | null
          outcome_index?: number | null
          price?: number | null
          raw?: Json
          side?: string | null
          size?: number | null
          slug?: string | null
          timestamp?: number
          title?: string | null
          transaction_hash?: string
          ts?: string | null
          type?: string
          usdc_size?: number | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["address"]
          },
        ]
      }
      cohort_lead_analysis: {
        Row: {
          avg_lead_minutes: number | null
          computed_at: string
          follower_address: string
          id: number
          leader_address: string
          leader_first_pct: number | null
          median_lead_minutes: number | null
          shared_markets: number
        }
        Insert: {
          avg_lead_minutes?: number | null
          computed_at?: string
          follower_address: string
          id?: number
          leader_address: string
          leader_first_pct?: number | null
          median_lead_minutes?: number | null
          shared_markets?: number
        }
        Update: {
          avg_lead_minutes?: number | null
          computed_at?: string
          follower_address?: string
          id?: number
          leader_address?: string
          leader_first_pct?: number | null
          median_lead_minutes?: number | null
          shared_markets?: number
        }
        Relationships: []
      }
      markets: {
        Row: {
          category: string | null
          closed: boolean | null
          condition_id: string
          end_date: string | null
          event_id: string | null
          event_slug: string | null
          fetched_at: string
          icon: string | null
          liquidity: number | null
          outcomes: Json | null
          question: string | null
          raw: Json | null
          resolved_outcome: string | null
          slug: string | null
          start_date: string | null
          volume: number | null
        }
        Insert: {
          category?: string | null
          closed?: boolean | null
          condition_id: string
          end_date?: string | null
          event_id?: string | null
          event_slug?: string | null
          fetched_at?: string
          icon?: string | null
          liquidity?: number | null
          outcomes?: Json | null
          question?: string | null
          raw?: Json | null
          resolved_outcome?: string | null
          slug?: string | null
          start_date?: string | null
          volume?: number | null
        }
        Update: {
          category?: string | null
          closed?: boolean | null
          condition_id?: string
          end_date?: string | null
          event_id?: string | null
          event_slug?: string | null
          fetched_at?: string
          icon?: string | null
          liquidity?: number | null
          outcomes?: Json | null
          question?: string | null
          raw?: Json | null
          resolved_outcome?: string | null
          slug?: string | null
          start_date?: string | null
          volume?: number | null
        }
        Relationships: []
      }
      news_signals: {
        Row: {
          asset: string
          category: string | null
          condition_id: string
          detected_at: string
          exit_price: number | null
          horizons_done: Json
          hour_bucket: string
          id: number
          market_question: string | null
          outcome: string | null
          pct_change: number
          pnl_1h: number | null
          pnl_2h: number | null
          pnl_30m: number | null
          pnl_4h: number | null
          price_1h_ago: number
          price_2h: number | null
          price_30m: number | null
          price_4h: number | null
          price_now: number
          raw: Json | null
          realized_pnl: number | null
          recommended_buy_price: number | null
          recommended_position_usd: number
          resolved_at: string | null
          status: string
        }
        Insert: {
          asset: string
          category?: string | null
          condition_id: string
          detected_at?: string
          exit_price?: number | null
          horizons_done?: Json
          hour_bucket: string
          id?: number
          market_question?: string | null
          outcome?: string | null
          pct_change: number
          pnl_1h?: number | null
          pnl_2h?: number | null
          pnl_30m?: number | null
          pnl_4h?: number | null
          price_1h_ago: number
          price_2h?: number | null
          price_30m?: number | null
          price_4h?: number | null
          price_now: number
          raw?: Json | null
          realized_pnl?: number | null
          recommended_buy_price?: number | null
          recommended_position_usd?: number
          resolved_at?: string | null
          status?: string
        }
        Update: {
          asset?: string
          category?: string | null
          condition_id?: string
          detected_at?: string
          exit_price?: number | null
          horizons_done?: Json
          hour_bucket?: string
          id?: number
          market_question?: string | null
          outcome?: string | null
          pct_change?: number
          pnl_1h?: number | null
          pnl_2h?: number | null
          pnl_30m?: number | null
          pnl_4h?: number | null
          price_1h_ago?: number
          price_2h?: number | null
          price_30m?: number | null
          price_4h?: number | null
          price_now?: number
          raw?: Json | null
          realized_pnl?: number | null
          recommended_buy_price?: number | null
          recommended_position_usd?: number
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      paper_bot_config: {
        Row: {
          breakeven_trigger_pct: number
          dynamic_exits: boolean
          dynamic_time_stop: boolean
          enabled: boolean
          id: number
          max_open_per_event: number
          max_open_total: number
          min_drift_pct: number
          min_market_liquidity_usd: number
          min_market_volume_usd: number
          min_score: number
          reversal_buy_bonus: boolean
          sl_pct: number
          starting_budget_usd: number
          time_stop_hours: number
          tp_pct: number
          updated_at: string
          whale_reversal_exit: boolean
        }
        Insert: {
          breakeven_trigger_pct?: number
          dynamic_exits?: boolean
          dynamic_time_stop?: boolean
          enabled?: boolean
          id?: number
          max_open_per_event?: number
          max_open_total?: number
          min_drift_pct?: number
          min_market_liquidity_usd?: number
          min_market_volume_usd?: number
          min_score?: number
          reversal_buy_bonus?: boolean
          sl_pct?: number
          starting_budget_usd?: number
          time_stop_hours?: number
          tp_pct?: number
          updated_at?: string
          whale_reversal_exit?: boolean
        }
        Update: {
          breakeven_trigger_pct?: number
          dynamic_exits?: boolean
          dynamic_time_stop?: boolean
          enabled?: boolean
          id?: number
          max_open_per_event?: number
          max_open_total?: number
          min_drift_pct?: number
          min_market_liquidity_usd?: number
          min_market_volume_usd?: number
          min_score?: number
          reversal_buy_bonus?: boolean
          sl_pct?: number
          starting_budget_usd?: number
          time_stop_hours?: number
          tp_pct?: number
          updated_at?: string
          whale_reversal_exit?: boolean
        }
        Relationships: []
      }
      paper_positions: {
        Row: {
          asset: string | null
          breakeven_moved: boolean
          closed_at: string | null
          condition_id: string
          current_price: number | null
          entry_price: number
          event_id: string | null
          exit_price: number | null
          exit_reason: string | null
          exit_strategy: string
          id: number
          last_price_at: string | null
          market_liquidity_usd: number | null
          market_volume_usd: number | null
          opened_at: string
          outcome: string | null
          peak_price: number | null
          pnl_pct: number | null
          pnl_usd: number | null
          price_tier: string | null
          reason: string
          score: number
          score_breakdown: Json | null
          shares: number
          signal_id: number | null
          size_usd: number
          sl_price: number
          status: string
          time_stop_at: string
          time_to_resolution_hours: number | null
          title: string | null
          total_usd: number | null
          tp_price: number
          unique_wallets: number | null
          wallet_addresses: Json | null
          wallet_labels: Json | null
        }
        Insert: {
          asset?: string | null
          breakeven_moved?: boolean
          closed_at?: string | null
          condition_id: string
          current_price?: number | null
          entry_price: number
          event_id?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          exit_strategy: string
          id?: number
          last_price_at?: string | null
          market_liquidity_usd?: number | null
          market_volume_usd?: number | null
          opened_at?: string
          outcome?: string | null
          peak_price?: number | null
          pnl_pct?: number | null
          pnl_usd?: number | null
          price_tier?: string | null
          reason: string
          score: number
          score_breakdown?: Json | null
          shares: number
          signal_id?: number | null
          size_usd: number
          sl_price: number
          status?: string
          time_stop_at: string
          time_to_resolution_hours?: number | null
          title?: string | null
          total_usd?: number | null
          tp_price: number
          unique_wallets?: number | null
          wallet_addresses?: Json | null
          wallet_labels?: Json | null
        }
        Update: {
          asset?: string | null
          breakeven_moved?: boolean
          closed_at?: string | null
          condition_id?: string
          current_price?: number | null
          entry_price?: number
          event_id?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          exit_strategy?: string
          id?: number
          last_price_at?: string | null
          market_liquidity_usd?: number | null
          market_volume_usd?: number | null
          opened_at?: string
          outcome?: string | null
          peak_price?: number | null
          pnl_pct?: number | null
          pnl_usd?: number | null
          price_tier?: string | null
          reason?: string
          score?: number
          score_breakdown?: Json | null
          shares?: number
          signal_id?: number | null
          size_usd?: number
          sl_price?: number
          status?: string
          time_stop_at?: string
          time_to_resolution_hours?: number | null
          title?: string | null
          total_usd?: number | null
          tp_price?: number
          unique_wallets?: number | null
          wallet_addresses?: Json | null
          wallet_labels?: Json | null
        }
        Relationships: []
      }
      positions_snapshots: {
        Row: {
          asset: string | null
          avg_price: number | null
          cash_pnl: number | null
          condition_id: string | null
          current_price: number | null
          current_value: number | null
          end_date: string | null
          event_slug: string | null
          id: number
          initial_value: number | null
          outcome: string | null
          outcome_index: number | null
          percent_pnl: number | null
          percent_realized_pnl: number | null
          raw: Json
          realized_pnl: number | null
          redeemable: boolean | null
          size: number | null
          slug: string | null
          snapshot_at: string
          status: string
          title: string | null
          total_bought: number | null
          wallet_address: string
        }
        Insert: {
          asset?: string | null
          avg_price?: number | null
          cash_pnl?: number | null
          condition_id?: string | null
          current_price?: number | null
          current_value?: number | null
          end_date?: string | null
          event_slug?: string | null
          id?: number
          initial_value?: number | null
          outcome?: string | null
          outcome_index?: number | null
          percent_pnl?: number | null
          percent_realized_pnl?: number | null
          raw: Json
          realized_pnl?: number | null
          redeemable?: boolean | null
          size?: number | null
          slug?: string | null
          snapshot_at?: string
          status: string
          title?: string | null
          total_bought?: number | null
          wallet_address: string
        }
        Update: {
          asset?: string | null
          avg_price?: number | null
          cash_pnl?: number | null
          condition_id?: string | null
          current_price?: number | null
          current_value?: number | null
          end_date?: string | null
          event_slug?: string | null
          id?: number
          initial_value?: number | null
          outcome?: string | null
          outcome_index?: number | null
          percent_pnl?: number | null
          percent_realized_pnl?: number | null
          raw?: Json
          realized_pnl?: number | null
          redeemable?: boolean | null
          size?: number | null
          slug?: string | null
          snapshot_at?: string
          status?: string
          title?: string | null
          total_bought?: number | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_snapshots_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["address"]
          },
        ]
      }
      real_bot_config: {
        Row: {
          breakeven_trigger_pct: number
          daily_halt_until: string | null
          daily_loss_limit_usd: number
          dry_run: boolean
          dynamic_exits: boolean
          dynamic_time_stop: boolean
          enabled: boolean
          fee_pct: number
          id: number
          max_entry_price: number
          max_open_per_event: number
          max_open_total: number
          max_slippage_pct: number
          min_drift_pct: number
          min_entry_price: number
          min_market_liquidity_usd: number
          min_market_volume_usd: number
          min_score: number
          reversal_buy_bonus: boolean
          sl_pct: number
          starting_budget_usd: number
          time_stop_hours: number
          tp_pct: number
          updated_at: string
          whale_reversal_exit: boolean
        }
        Insert: {
          breakeven_trigger_pct?: number
          daily_halt_until?: string | null
          daily_loss_limit_usd?: number
          dry_run?: boolean
          dynamic_exits?: boolean
          dynamic_time_stop?: boolean
          enabled?: boolean
          fee_pct?: number
          id?: number
          max_entry_price?: number
          max_open_per_event?: number
          max_open_total?: number
          max_slippage_pct?: number
          min_drift_pct?: number
          min_entry_price?: number
          min_market_liquidity_usd?: number
          min_market_volume_usd?: number
          min_score?: number
          reversal_buy_bonus?: boolean
          sl_pct?: number
          starting_budget_usd?: number
          time_stop_hours?: number
          tp_pct?: number
          updated_at?: string
          whale_reversal_exit?: boolean
        }
        Update: {
          breakeven_trigger_pct?: number
          daily_halt_until?: string | null
          daily_loss_limit_usd?: number
          dry_run?: boolean
          dynamic_exits?: boolean
          dynamic_time_stop?: boolean
          enabled?: boolean
          fee_pct?: number
          id?: number
          max_entry_price?: number
          max_open_per_event?: number
          max_open_total?: number
          max_slippage_pct?: number
          min_drift_pct?: number
          min_entry_price?: number
          min_market_liquidity_usd?: number
          min_market_volume_usd?: number
          min_score?: number
          reversal_buy_bonus?: boolean
          sl_pct?: number
          starting_budget_usd?: number
          time_stop_hours?: number
          tp_pct?: number
          updated_at?: string
          whale_reversal_exit?: boolean
        }
        Relationships: []
      }
      real_positions: {
        Row: {
          asset: string | null
          breakeven_moved: boolean
          closed_at: string | null
          condition_id: string
          current_price: number | null
          dry_run: boolean
          entry_price: number
          event_id: string | null
          exit_price: number | null
          exit_reason: string | null
          exit_strategy: string
          id: number
          last_price_at: string | null
          market_liquidity_usd: number | null
          market_volume_usd: number | null
          opened_at: string
          order_id: string | null
          outcome: string | null
          peak_price: number | null
          pnl_pct: number | null
          pnl_usd: number | null
          price_tier: string | null
          reason: string
          score: number
          score_breakdown: Json | null
          shares: number
          signal_id: number | null
          size_usd: number
          sl_price: number
          status: string
          time_stop_at: string
          time_to_resolution_hours: number | null
          title: string | null
          total_usd: number | null
          tp_price: number
          unique_wallets: number | null
          wallet_addresses: Json | null
          wallet_labels: Json | null
        }
        Insert: {
          asset?: string | null
          breakeven_moved?: boolean
          closed_at?: string | null
          condition_id: string
          current_price?: number | null
          dry_run?: boolean
          entry_price: number
          event_id?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          exit_strategy: string
          id?: number
          last_price_at?: string | null
          market_liquidity_usd?: number | null
          market_volume_usd?: number | null
          opened_at?: string
          order_id?: string | null
          outcome?: string | null
          peak_price?: number | null
          pnl_pct?: number | null
          pnl_usd?: number | null
          price_tier?: string | null
          reason: string
          score: number
          score_breakdown?: Json | null
          shares: number
          signal_id?: number | null
          size_usd: number
          sl_price: number
          status?: string
          time_stop_at: string
          time_to_resolution_hours?: number | null
          title?: string | null
          total_usd?: number | null
          tp_price: number
          unique_wallets?: number | null
          wallet_addresses?: Json | null
          wallet_labels?: Json | null
        }
        Update: {
          asset?: string | null
          breakeven_moved?: boolean
          closed_at?: string | null
          condition_id?: string
          current_price?: number | null
          dry_run?: boolean
          entry_price?: number
          event_id?: string | null
          exit_price?: number | null
          exit_reason?: string | null
          exit_strategy?: string
          id?: number
          last_price_at?: string | null
          market_liquidity_usd?: number | null
          market_volume_usd?: number | null
          opened_at?: string
          order_id?: string | null
          outcome?: string | null
          peak_price?: number | null
          pnl_pct?: number | null
          pnl_usd?: number | null
          price_tier?: string | null
          reason?: string
          score?: number
          score_breakdown?: Json | null
          shares?: number
          signal_id?: number | null
          size_usd?: number
          sl_price?: number
          status?: string
          time_stop_at?: string
          time_to_resolution_hours?: number | null
          title?: string | null
          total_usd?: number | null
          tp_price?: number
          unique_wallets?: number | null
          wallet_addresses?: Json | null
          wallet_labels?: Json | null
        }
        Relationships: []
      }
      tracked_wallets: {
        Row: {
          address: string
          alert_threshold_usd: number
          auto_disabled_reason: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          last_scanned_at: string | null
          last_scanned_ts: number
          quality_score: number
          quality_tier: string
        }
        Insert: {
          address: string
          alert_threshold_usd?: number
          auto_disabled_reason?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_scanned_at?: string | null
          last_scanned_ts?: number
          quality_score?: number
          quality_tier?: string
        }
        Update: {
          address?: string
          alert_threshold_usd?: number
          auto_disabled_reason?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          last_scanned_at?: string | null
          last_scanned_ts?: number
          quality_score?: number
          quality_tier?: string
        }
        Relationships: []
      }
      trade_alerts: {
        Row: {
          asset: string | null
          condition_id: string | null
          created_at: string
          id: string
          outcome: string | null
          price: number | null
          raw: Json
          side: string | null
          size: number | null
          timestamp_unix: number
          title: string | null
          transaction_hash: string
          ts: string
          type: string
          usdc_size: number | null
          wallet_address: string
          wallet_label: string | null
        }
        Insert: {
          asset?: string | null
          condition_id?: string | null
          created_at?: string
          id?: string
          outcome?: string | null
          price?: number | null
          raw: Json
          side?: string | null
          size?: number | null
          timestamp_unix: number
          title?: string | null
          transaction_hash: string
          ts: string
          type: string
          usdc_size?: number | null
          wallet_address: string
          wallet_label?: string | null
        }
        Update: {
          asset?: string | null
          condition_id?: string | null
          created_at?: string
          id?: string
          outcome?: string | null
          price?: number | null
          raw?: Json
          side?: string | null
          size?: number | null
          timestamp_unix?: number
          title?: string | null
          transaction_hash?: string
          ts?: string
          type?: string
          usdc_size?: number | null
          wallet_address?: string
          wallet_label?: string | null
        }
        Relationships: []
      }
      trade_triggers: {
        Row: {
          computed_at: string
          condition_id: string | null
          hours_to_resolution: number | null
          id: number
          is_winner: boolean | null
          pct_change_1h_after: number | null
          pct_change_1h_before: number | null
          price_1h_after: number | null
          price_1h_before: number | null
          price_24h_before: number | null
          price_6h_before: number | null
          price_at_trade: number | null
          trade_id: number
          trigger_type: string
          ts: string
          wallet_address: string
        }
        Insert: {
          computed_at?: string
          condition_id?: string | null
          hours_to_resolution?: number | null
          id?: number
          is_winner?: boolean | null
          pct_change_1h_after?: number | null
          pct_change_1h_before?: number | null
          price_1h_after?: number | null
          price_1h_before?: number | null
          price_24h_before?: number | null
          price_6h_before?: number | null
          price_at_trade?: number | null
          trade_id: number
          trigger_type: string
          ts: string
          wallet_address: string
        }
        Update: {
          computed_at?: string
          condition_id?: string | null
          hours_to_resolution?: number | null
          id?: number
          is_winner?: boolean | null
          pct_change_1h_after?: number | null
          pct_change_1h_before?: number | null
          price_1h_after?: number | null
          price_1h_before?: number | null
          price_24h_before?: number | null
          price_6h_before?: number | null
          price_at_trade?: number | null
          trade_id?: number
          trigger_type?: string
          ts?: string
          wallet_address?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          asset: string | null
          condition_id: string | null
          event_slug: string | null
          id: number
          outcome: string | null
          outcome_index: number | null
          price: number | null
          raw: Json
          side: string | null
          size: number | null
          slug: string | null
          timestamp: number
          title: string | null
          transaction_hash: string
          ts: string | null
          wallet_address: string
        }
        Insert: {
          asset?: string | null
          condition_id?: string | null
          event_slug?: string | null
          id?: number
          outcome?: string | null
          outcome_index?: number | null
          price?: number | null
          raw: Json
          side?: string | null
          size?: number | null
          slug?: string | null
          timestamp: number
          title?: string | null
          transaction_hash: string
          ts?: string | null
          wallet_address: string
        }
        Update: {
          asset?: string | null
          condition_id?: string | null
          event_slug?: string | null
          id?: number
          outcome?: string | null
          outcome_index?: number | null
          price?: number | null
          raw?: Json
          side?: string | null
          size?: number | null
          slug?: string | null
          timestamp?: number
          title?: string | null
          transaction_hash?: string
          ts?: string | null
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_wallet_address_fkey"
            columns: ["wallet_address"]
            isOneToOne: false
            referencedRelation: "wallets"
            referencedColumns: ["address"]
          },
        ]
      }
      wallet_equity_daily: {
        Row: {
          computed_at: string
          cumulative_pnl: number
          cumulative_volume: number
          day: string
          id: number
          open_value: number | null
          trade_count: number
          wallet_address: string
        }
        Insert: {
          computed_at?: string
          cumulative_pnl?: number
          cumulative_volume?: number
          day: string
          id?: number
          open_value?: number | null
          trade_count?: number
          wallet_address: string
        }
        Update: {
          computed_at?: string
          cumulative_pnl?: number
          cumulative_volume?: number
          day?: string
          id?: number
          open_value?: number | null
          trade_count?: number
          wallet_address?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          address: string
          created_at: string
          label: string | null
          last_synced_at: string | null
        }
        Insert: {
          address: string
          created_at?: string
          label?: string | null
          last_synced_at?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          label?: string | null
          last_synced_at?: string | null
        }
        Relationships: []
      }
      whale_performance: {
        Row: {
          avg_roi_pct: number | null
          closed_positions: number
          computed_at: string
          id: number
          last_30d_trades: number
          last_trade_at: string | null
          losing_positions: number
          quality_score: number
          quality_tier: string
          raw_summary: Json | null
          total_pnl_usd: number
          total_trades: number
          total_volume_usd: number
          unique_markets: number
          wallet_address: string
          win_rate: number | null
          winning_positions: number
        }
        Insert: {
          avg_roi_pct?: number | null
          closed_positions?: number
          computed_at?: string
          id?: number
          last_30d_trades?: number
          last_trade_at?: string | null
          losing_positions?: number
          quality_score?: number
          quality_tier?: string
          raw_summary?: Json | null
          total_pnl_usd?: number
          total_trades?: number
          total_volume_usd?: number
          unique_markets?: number
          wallet_address: string
          win_rate?: number | null
          winning_positions?: number
        }
        Update: {
          avg_roi_pct?: number | null
          closed_positions?: number
          computed_at?: string
          id?: number
          last_30d_trades?: number
          last_trade_at?: string | null
          losing_positions?: number
          quality_score?: number
          quality_tier?: string
          raw_summary?: Json | null
          total_pnl_usd?: number
          total_trades?: number
          total_volume_usd?: number
          unique_markets?: number
          wallet_address?: string
          win_rate?: number | null
          winning_positions?: number
        }
        Relationships: []
      }
      whale_signals: {
        Row: {
          action: string
          asset: string | null
          avg_price: number
          burst_minutes: number | null
          computed_at: string
          condition_id: string
          current_price: number | null
          first_buy_at: string
          id: number
          last_buy_at: string
          max_price: number | null
          min_price: number | null
          minutes_since_last_buy: number
          outcome: string | null
          price_drift_pct: number | null
          price_std: number | null
          score: number
          score_breakdown: Json | null
          title: string | null
          total_buys: number
          total_usd: number
          unique_wallets: number
          wallet_addresses: Json
          wallet_labels: Json
        }
        Insert: {
          action: string
          asset?: string | null
          avg_price: number
          burst_minutes?: number | null
          computed_at?: string
          condition_id: string
          current_price?: number | null
          first_buy_at: string
          id?: number
          last_buy_at: string
          max_price?: number | null
          min_price?: number | null
          minutes_since_last_buy: number
          outcome?: string | null
          price_drift_pct?: number | null
          price_std?: number | null
          score: number
          score_breakdown?: Json | null
          title?: string | null
          total_buys: number
          total_usd: number
          unique_wallets: number
          wallet_addresses?: Json
          wallet_labels?: Json
        }
        Update: {
          action?: string
          asset?: string | null
          avg_price?: number
          burst_minutes?: number | null
          computed_at?: string
          condition_id?: string
          current_price?: number | null
          first_buy_at?: string
          id?: number
          last_buy_at?: string
          max_price?: number | null
          min_price?: number | null
          minutes_since_last_buy?: number
          outcome?: string | null
          price_drift_pct?: number | null
          price_std?: number | null
          score?: number
          score_breakdown?: Json | null
          title?: string | null
          total_buys?: number
          total_usd?: number
          unique_wallets?: number
          wallet_addresses?: Json
          wallet_labels?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_signals_for_horizon: {
        Args: {
          _horizon_key: string
          _horizon_seconds: number
          _limit?: number
        }
        Returns: {
          asset: string
          id: number
          price_now: number
          recommended_position_usd: number
        }[]
      }
      claim_signals_for_resolution: {
        Args: {
          _limit?: number
          _max_age_seconds?: number
          _stuck_seconds?: number
        }
        Returns: {
          asset: string
          id: number
          price_now: number
          recommended_position_usd: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
