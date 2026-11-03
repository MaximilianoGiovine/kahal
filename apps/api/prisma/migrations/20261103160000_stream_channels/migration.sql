-- AlterEnum
ALTER TYPE "StreamPlatform" ADD VALUE 'TWITCH';

-- AlterTable
ALTER TABLE "Church" ADD COLUMN "youtubeUrl" TEXT,
ADD COLUMN "facebookUrl" TEXT,
ADD COLUMN "twitchUrl" TEXT;
