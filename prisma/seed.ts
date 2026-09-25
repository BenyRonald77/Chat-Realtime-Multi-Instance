import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const users = [
    { name: "Gita", email: "gita@chat.test", password: "gita123" },
    { name: "Hadi", email: "hadi@chat.test", password: "hadi123" },
    { name: "Ivan", email: "ivan@chat.test", password: "ivan123" },
  ];

  const created: Record<string, string> = {};
  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash },
    });
    created[u.name] = user.id;
  }

  const existingConvo = await prisma.conversationParticipant.findFirst({
    where: { userId: created.Gita },
    include: { conversation: { include: { participants: true } } },
  });

  if (!existingConvo) {
    const conversation = await prisma.conversation.create({
      data: {
        participants: {
          create: [{ userId: created.Gita }, { userId: created.Hadi }],
        },
        messages: {
          create: [
            { senderId: created.Gita, content: "Halo Hadi!" },
            { senderId: created.Hadi, content: "Halo Gita, apa kabar?" },
            { senderId: created.Gita, content: "Baik! Lagi coba chat realtime nih." },
          ],
        },
      },
    });
    console.log(`- Percakapan contoh dibuat: ${conversation.id}`);
  }

  console.log("Seed selesai:");
  console.log("- Login: gita@chat.test / gita123, hadi@chat.test / hadi123, ivan@chat.test / ivan123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
