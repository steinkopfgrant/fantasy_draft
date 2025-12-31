-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    balance DECIMAL(10,2) DEFAULT 1000.00,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Contest types configuration
CREATE TABLE contest_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL, -- 'cash', 'bash', 'market', 'kingpin'
    entry_fee DECIMAL(10,2) NOT NULL,
    max_entries INTEGER, -- NULL for unlimited
    prize_structure JSONB NOT NULL, -- {"1": 25, "2": 0, ...} or {"1": 0.6, "2": 0.2, ...}
    rake_percentage DECIMAL(5,2) DEFAULT 0
);

-- Individual contest instances
CREATE TABLE contests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_type_id UUID REFERENCES contest_types(id),
    contest_name VARCHAR(100) NOT NULL, -- 'CashGame-12345', 'DailyBash-1', etc.
    status VARCHAR(20) NOT NULL DEFAULT 'entry', -- 'entry', 'drafted', 'live', 'payout', 'completed'
    player_board JSONB NOT NULL, -- Stores the entire board configuration
    current_entries INTEGER DEFAULT 0,
    
    -- Timing windows
    entry_start_time TIMESTAMP DEFAULT NOW(),
    entry_end_time TIMESTAMP NOT NULL,
    event_start_time TIMESTAMP NOT NULL,
    event_end_time TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    CONSTRAINT unique_contest_name UNIQUE (contest_name)
);

-- User entries in contests
CREATE TABLE contest_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contest_id UUID REFERENCES contests(id),
    user_id UUID REFERENCES users(id),
    draft_position INTEGER NOT NULL, -- 0-4 for 5-person draft
    team_color VARCHAR(20) NOT NULL,
    roster JSONB NOT NULL, -- {QB: player, RB: player, WR: player, TE: player, FLEX: player}
    
    -- Scoring
    total_points DECIMAL(10,2) DEFAULT 0,
    final_rank INTEGER,
    prize_won DECIMAL(10,2) DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_user_contest UNIQUE (contest_id, user_id),
    CONSTRAINT unique_contest_position UNIQUE (contest_id, draft_position)
);

-- Individual draft picks for replay/audit
CREATE TABLE draft_picks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES contest_entries(id),
    pick_number INTEGER NOT NULL,
    player_data JSONB NOT NULL, -- {name, team, position, price, etc}
    roster_slot VARCHAR(10) NOT NULL, -- 'QB', 'RB', 'WR', 'TE', 'FLEX'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Player scoring data (updated via API)
CREATE TABLE player_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_name VARCHAR(100) NOT NULL,
    player_team VARCHAR(10) NOT NULL,
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    stats JSONB NOT NULL, -- {passing_yards: 300, touchdowns: 2, etc}
    fantasy_points DECIMAL(10,2) NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT unique_player_week UNIQUE (player_name, player_team, week, season)
);

-- Financial transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    type VARCHAR(20) NOT NULL, -- 'deposit', 'withdrawal', 'entry_fee', 'prize'
    amount DECIMAL(10,2) NOT NULL,
    balance_after DECIMAL(10,2) NOT NULL,
    contest_id UUID REFERENCES contests(id), -- NULL for deposits/withdrawals
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_contests_status ON contests(status);
CREATE INDEX idx_contests_entry_end ON contests(entry_end_time);
CREATE INDEX idx_contest_entries_user ON contest_entries(user_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);