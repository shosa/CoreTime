import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Admin user
  const adminPassword = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@coretime.local' },
    update: {},
    create: {
      email: 'admin@coretime.local',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'CoreTime',
      role: 'admin',
    },
  });

  // HR user
  const hrPassword = await bcrypt.hash('hr123', 10);
  await prisma.user.upsert({
    where: { email: 'hr@coretime.local' },
    update: {},
    create: {
      email: 'hr@coretime.local',
      password: hrPassword,
      firstName: 'Responsabile',
      lastName: 'Paghe',
      role: 'hr',
    },
  });

  // Reparti esempio
  const dept1 = await prisma.department.upsert({
    where: { code: 'MAN1' },
    update: {},
    create: { code: 'MAN1', name: 'Manovia 1' },
  });

  const dept2 = await prisma.department.upsert({
    where: { code: 'MAN2' },
    update: {},
    create: { code: 'MAN2', name: 'Manovia 2' },
  });

  const dept3 = await prisma.department.upsert({
    where: { code: 'MAG' },
    update: {},
    create: { code: 'MAG', name: 'Magazzino' },
  });

  // Dipendenti esempio
  const emp1 = await prisma.employee.upsert({
    where: { code: '001' },
    update: {},
    create: { code: '001', firstName: 'Mario', lastName: 'Rossi', hourlyRate: 10.50 },
  });

  const emp2 = await prisma.employee.upsert({
    where: { code: '002' },
    update: {},
    create: { code: '002', firstName: 'Lucia', lastName: 'Bianchi', hourlyRate: 10.50 },
  });

  const emp3 = await prisma.employee.upsert({
    where: { code: '003' },
    update: {},
    create: { code: '003', firstName: 'Giuseppe', lastName: 'Verdi', hourlyRate: 10.50 },
  });

  // Assegnazioni reparto
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const [emp, dept] of [[emp1, dept1], [emp2, dept1], [emp3, dept2]] as const) {
    const existing = await prisma.employeeDepartment.findFirst({
      where: { employeeId: emp.id, assignedTo: null },
    });
    if (!existing) {
      await prisma.employeeDepartment.create({
        data: { employeeId: emp.id, departmentId: dept.id, assignedFrom: today },
      });
    }
  }

  console.log('✅ Seed completato');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
