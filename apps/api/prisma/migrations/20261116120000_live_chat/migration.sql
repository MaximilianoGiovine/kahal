-- AlterTable
ALTER TABLE "Church" ADD COLUMN     "liveChatEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "liveChatWelcome" TEXT DEFAULT '¡Te damos la bienvenida! Saluda a la iglesia y cuéntanos desde dónde nos acompañas.';

-- AlterTable
ALTER TABLE "LiveStream" ADD COLUMN     "chatClosedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LiveChatMessage" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "userId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveChatLog" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "streamId" TEXT,
    "title" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "participantCount" INTEGER NOT NULL,
    "transcript" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveChatLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveChatMessage_streamId_createdAt_idx" ON "LiveChatMessage"("streamId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveChatMessage_churchId_idx" ON "LiveChatMessage"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "LiveChatLog_streamId_key" ON "LiveChatLog"("streamId");

-- CreateIndex
CREATE INDEX "LiveChatLog_churchId_endedAt_idx" ON "LiveChatLog"("churchId", "endedAt");

-- AddForeignKey
ALTER TABLE "LiveChatMessage" ADD CONSTRAINT "LiveChatMessage_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveChatMessage" ADD CONSTRAINT "LiveChatMessage_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveChatMessage" ADD CONSTRAINT "LiveChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveChatLog" ADD CONSTRAINT "LiveChatLog_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveChatLog" ADD CONSTRAINT "LiveChatLog_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream"("id") ON DELETE SET NULL ON UPDATE CASCADE;

