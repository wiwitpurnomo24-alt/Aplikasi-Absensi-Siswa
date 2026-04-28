import fs from 'fs';
const files = [
  'src/pages/AdminDashboard.tsx',
  'src/pages/SubjectTeacherDashboard.tsx',
  'src/pages/AttendanceOfficerDashboard.tsx',
  'src/pages/TeacherDashboard.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/<table className="w-full text-left border-collapse">/g, '<table className="w-full text-left border-collapse min-w-[800px]">');
  content = content.replace(/<table className="w-full text-left">/g, '<table className="w-full text-left min-w-[600px]">');
  content = content.replace(/<table className="w-full">/g, '<table className="w-full min-w-[600px]">');
  fs.writeFileSync(file, content);
});
console.log('Tables updated!');
