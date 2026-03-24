const express = require('express');
const router = express.Router();

// Temporary in-memory storage (replace with database)
let enrollments = [];
let lecturerAssignments = [];

// Get all enrollments
router.get('/', (req, res) => {
  try {
    const { student_id, program_id } = req.query;
    
    let filteredEnrollments = enrollments;
    
    if (student_id) {
      filteredEnrollments = filteredEnrollments.filter(e => e.student_id === student_id);
    }
    
    if (program_id) {
      filteredEnrollments = filteredEnrollments.filter(e => e.program_id === program_id);
    }
    
    res.json({
      success: true,
      data: filteredEnrollments
    });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch enrollments'
    });
  }
});

// Create new enrollment
router.post('/', (req, res) => {
  try {
    const { student_id, program_id } = req.body;
    
    if (!student_id || !program_id) {
      return res.status(400).json({
        success: false,
        message: 'Student ID and Program ID are required'
      });
    }
    
    // Check if enrollment already exists
    const existingEnrollment = enrollments.find(e => 
      e.student_id === student_id && e.program_id === program_id
    );
    
    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: 'Student is already enrolled in this program'
      });
    }
    
    const newEnrollment = {
      id: Date.now().toString(),
      student_id,
      program_id,
      enrollment_date: new Date().toISOString(),
      status: 'active'
    };
    
    enrollments.push(newEnrollment);
    
    res.json({
      success: true,
      data: newEnrollment,
      message: 'Student enrolled successfully'
    });
  } catch (error) {
    console.error('Error creating enrollment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create enrollment'
    });
  }
});

// Get lecturer assignments
router.get('/lecturer-assignments', (req, res) => {
  try {
    const { lecturer_id, program_id } = req.query;
    
    let filteredAssignments = lecturerAssignments;
    
    if (lecturer_id) {
      filteredAssignments = filteredAssignments.filter(a => a.lecturer_id === lecturer_id);
    }
    
    if (program_id) {
      filteredAssignments = filteredAssignments.filter(a => a.program_id === program_id);
    }
    
    res.json({
      success: true,
      data: filteredAssignments
    });
  } catch (error) {
    console.error('Error fetching lecturer assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lecturer assignments'
    });
  }
});

// Create lecturer assignment
router.post('/lecturer-assignments', (req, res) => {
  try {
    const { lecturer_id, program_id } = req.body;
    
    if (!lecturer_id || !program_id) {
      return res.status(400).json({
        success: false,
        message: 'Lecturer ID and Program ID are required'
      });
    }
    
    // Check if assignment already exists
    const existingAssignment = lecturerAssignments.find(a => 
      a.lecturer_id === lecturer_id && a.program_id === program_id
    );
    
    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Lecturer is already assigned to this program'
      });
    }
    
    const newAssignment = {
      id: Date.now().toString(),
      lecturer_id,
      program_id,
      assignment_date: new Date().toISOString(),
      status: 'active'
    };
    
    lecturerAssignments.push(newAssignment);
    
    res.json({
      success: true,
      data: newAssignment,
      message: 'Lecturer assigned successfully'
    });
  } catch (error) {
    console.error('Error creating lecturer assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create lecturer assignment'
    });
  }
});

module.exports = router;
