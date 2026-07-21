# Game Domain Unit

The current game module is pure TypeScript and has no renderer, UI, physics world, clock, or network dependency.

## Removal policy

For a confirmed symbol, `RemovalTargetSelector` chooses the earliest valid `SETTLED` letter by `settledAt`. Only if there is no valid settled entry does it choose the earliest valid `FALLING` letter by `spawnedAt`. `REMOVING` and `REMOVED` records remain in symbol queues as stale IDs and are ignored at selection time.

## Input lock

`InputLock` locks the confirmed symbol. Repeating that symbol remains blocked even after cooldown until `handReleased()` is called. A different symbol can replace the lock only after cooldown when `allowDifferentSymbolSwitch` is enabled. Development callers can disable the lock through `GameConfig`.

## Manual verification

Run the isolated domain test:

```powershell
cd C:\Users\SSAFY\Desktop\Sign_Language_Translation\frontend
npx vitest run src/game/core/RemovalSystem.test.ts
```

For a future runtime integration, spawn two letters with the same symbol, settle one, submit the symbol once, and verify the settled entity transitions to `REMOVING`. Submit again without hand release and verify `INPUT_REJECTED`; call `handReleased()` and submit again to allow the next valid entity.
