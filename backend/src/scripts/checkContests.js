// backend/src/scripts/checkContests.js
const db = require('../models');

async function checkContests() {
  try {
    console.log('🔍 Checking current contest values...\n');
    
    const contests = await db.Contest.findAll({
      order: [['type', 'ASC'], ['name', 'ASC']]
    });
    
    console.log(`Found ${contests.length} contests:\n`);
    
    // Group by type for better display
    const contestsByType = {};
    
    contests.forEach(contest => {
      if (!contestsByType[contest.type]) {
        contestsByType[contest.type] = [];
      }
      contestsByType[contest.type].push(contest);
    });
    
    // Display contests by type
    Object.entries(contestsByType).forEach(([type, typeContests]) => {
      console.log(`${type.toUpperCase()} CONTESTS:`);
      console.log('─'.repeat(50));
      
      typeContests.forEach(contest => {
        console.log(`Name: ${contest.name}`);
        console.log(`  Entry Fee: $${parseFloat(contest.entry_fee).toFixed(2)}`);
        console.log(`  Prize Pool: $${parseFloat(contest.prize_pool).toLocaleString()}`);
        console.log(`  Entries: ${contest.current_entries}/${contest.max_entries}`);
        console.log(`  Status: ${contest.status}`);
        console.log('');
      });
    });
    
    // Check for issues
    console.log('\n🔍 ISSUES FOUND:');
    console.log('─'.repeat(50));
    
    let issuesFound = false;
    
    contests.forEach(contest => {
      const issues = [];
      
      if (parseFloat(contest.entry_fee) === 0 && contest.type === 'cash') {
        issues.push('Cash contest has $0 entry fee');
      }
      
      if (parseFloat(contest.prize_pool) === 0) {
        issues.push('Prize pool is $0');
      }
      
      if (contest.type === 'bash' && parseFloat(contest.entry_fee) > 0) {
        issues.push('Bash contest should be free');
      }
      
      if (issues.length > 0) {
        issuesFound = true;
        console.log(`${contest.name}:`);
        issues.forEach(issue => console.log(`  - ${issue}`));
      }
    });
    
    if (!issuesFound) {
      console.log('✅ No issues found!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error checking contests:', error);
    process.exit(1);
  }
}

checkContests();