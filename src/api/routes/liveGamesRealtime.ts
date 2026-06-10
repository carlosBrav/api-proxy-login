import { Router, Request, Response } from 'express';
import { env } from '../../config/env';
import { patchMatchesAnyExternalId } from '../../domain/externalIdMatch';
import { RealtimePatchMessage } from '../../domain/RealtimePatchMessage';
import { liveGamesStore } from '../../pubsub/LiveGamesStore';
import { realtimeQuerySchema } from '../middleware/validateQuery';

const router = Router();

router.get('/api/v1/live-games/realtime', (req: Request, res: Response): void => {
  const parsed = realtimeQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Se requiere el query param "externalIds" con al menos un ID.',
      details: parsed.error.format(),
    });
    return;
  }

  const { externalIds, idProveedor } = parsed.data;

  if (env.ID_PROVEEDOR_REQUIRED && idProveedor === undefined) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'El query param "idProveedor" es obligatorio en este entorno.',
    });
    return;
  }

  const filtered = liveGamesStore.getAll().filter((patch) => {
    const matchId = patchMatchesAnyExternalId(patch.external_id, externalIds);
    const matchProvider =
      idProveedor === undefined || patch.idProveedor === idProveedor;
    return matchId && matchProvider;
  });

  const now = new Date().toISOString();
  const response: RealtimePatchMessage = {
    type: 'patch',
    version: now,
    serverTime: now,
    updates: filtered,
  };

  res.status(200).json(response);
});

export { router as liveGamesRealtimeRouter };
