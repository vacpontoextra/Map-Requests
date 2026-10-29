-- CreateTable
CREATE TABLE "MapRequest" (
    "id" SERIAL NOT NULL,
    "mapId" INTEGER NOT NULL,
    "mapUid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "thumbnailUrl" TEXT,
    "length" TEXT,
    "difficulty" TEXT,
    "awards" INTEGER NOT NULL DEFAULT 0,
    "tmxUrl" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameKey" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "played" BOOLEAN NOT NULL DEFAULT false,
    "playedAt" TIMESTAMP(3),

    CONSTRAINT "MapRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MapRequest_played_requestedAt_idx" ON "MapRequest"("played", "requestedAt");

-- CreateIndex
CREATE INDEX "MapRequest_mapId_idx" ON "MapRequest"("mapId");

-- CreateIndex
CREATE INDEX "MapRequest_usernameKey_idx" ON "MapRequest"("usernameKey");
