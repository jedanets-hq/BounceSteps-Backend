// Fix Assignment Program IDs
// This script updates existing assignments to have the correct program_id

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/lms_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixAssignmentProgramIds() {
  console.log('\n========================================');
  console.log('FIXING ASSIGNMENT PROGRAM IDs');
  console.log('========================================\n');
  
  try {
    // 1. Get all assignments without program_id
    console.log('1️⃣ Finding assignments without program_id...');
    const assignmentsResult = await pool.query(`
      SELECT id, title, program_name, program_id
      FROM assignments
      WHERE program_id IS NULL
      ORDER BY created_at DESC
    `);
    
    console.log(`Found ${assignmentsResult.rows.length} assignments without program_id\n`);
    
    if (assignmentsResult.rows.length === 0) {
      console.log('✅ All assignments already have program_id set!');
      return;
    }
    
    // 2. Get all programs
    const programsResult = await pool.query('SELECT id, name FROM programs');
    console.log(`Found ${programsResult.rows.length} programs in database\n`);
    
    // Create a map for quick lookup
    const programMap = new Map();
    programsResult.rows.forEach(p => {
      // Store both exact and lowercase versions for matching
      programMap.set(p.name.toLowerCase().trim(), p);
    });
    
    // 3. Update each assignment
    let updatedCount = 0;
    let notFoundCount = 0;
    
    console.log('2️⃣ Updating assignments...\n');
    
    for (const assignment of assignmentsResult.rows) {
      const programNameLower = (assignment.program_name || '').toLowerCase().trim();
      const matchedProgram = programMap.get(programNameLower);
      
      if (matchedProgram) {
        await pool.query(
          'UPDATE assignments SET program_id = $1 WHERE id = $2',
          [matchedProgram.id, assignment.id]
        );
        
        console.log(`✅ Updated: "${assignment.title}"`);
        console.log(`   Program: "${assignment.program_name}" → program_id: ${matchedProgram.id}`);
        updatedCount++;
      } else {
        console.log(`⚠️ No match: "${assignment.title}"`);
        console.log(`   Program: "${assignment.program_name}" - No matching program found in database`);
        notFoundCount++;
      }
    }
    
    // 4. Summary
    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================');
    console.log(`Total assignments processed: ${assignmentsResult.rows.length}`);
    console.log(`✅ Updated successfully: ${updatedCount}`);
    console.log(`⚠️ No match found: ${notFoundCount}`);
    
    if (notFoundCount > 0) {
      console.log('\n⚠️ Some assignments could not be matched to programs.');
      console.log('   These assignments will use name-based matching instead.');
      console.log('   Make sure the program names match exactly (case-insensitive).');
    }
    
    // 5. Verify
    console.log('\n3️⃣ Verifying updates...');
    const verifyResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(program_id) as with_id,
        COUNT(*) - COUNT(program_id) as without_id
      FROM assignments
    `);
    
    const stats = verifyResult.rows[0];
    console.log(`Total assignments: ${stats.total}`);
    console.log(`With program_id: ${stats.with_id}`);
    console.log(`Without program_id: ${stats.without_id}`);
    
    if (stats.without_id === 0) {
      console.log('\n✅ SUCCESS! All assignments now have program_id set.');
    } else {
      console.log(`\n⚠️ ${stats.without_id} assignment(s) still without program_id.`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing program IDs:', error);
  } finally {
    await pool.end();
  }
}

fixAssignmentProgramIds();
