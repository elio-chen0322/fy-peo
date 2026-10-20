import {
  identity,
  db,
  bucket,
  AppError,
  response,
  failure,
  event,
} from '@/lib/server';
export async function GET(req: Request) {
  try {
    const { owner } = await identity(req);
    const id = new URL(req.url).searchParams.get('id');
    const f = await db()
      .prepare('SELECT * FROM files WHERE id=? AND owner=?')
      .bind(id || '', owner)
      .first<any>();
    if (!f) throw new AppError('附件不存在', 404);
    const obj = await bucket().get(f.storage_key);
    if (!obj) throw new AppError('附件暂不可用', 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const { owner, actor } = await identity(req);
    if (Number(req.headers.get('content-length') || 0) > 21_000_000)
      throw new AppError('单个附件不能超过 20 MB');
    const form = await req.formData();
    const file = form.get('file'),
      id = String(form.get('feedback_id') || '');
    if (!(file instanceof File) || !file.size || file.size > 20_000_000)
      throw new AppError('请选择不超过 20 MB 的附件');
    if (
      !(await db()
        .prepare('SELECT id FROM feedback WHERE id=? AND owner=?')
        .bind(id, owner)
        .first())
    )
      throw new AppError('请先保存反馈', 404);
    const fileId = crypto.randomUUID(),
      key = owner + '/' + fileId;
    await bucket().put(key, file.stream());
    try {
      await db()
        .prepare(
          'INSERT INTO files(id,owner,feedback_id,name,mime,size,storage_key,created_at) VALUES(?,?,?,?,?,?,?,?)',
        )
        .bind(
          fileId,
          owner,
          id,
          file.name.slice(0, 250),
          file.type,
          file.size,
          key,
          new Date().toISOString(),
        )
        .run();
    } catch (e) {
      await bucket().delete(key);
      throw e;
    }
    await event(
      owner,
      actor,
      '上传附件',
      {},
      { id: fileId, name: file.name },
      id,
    );
    return response({ id: fileId });
  } catch (e) {
    return failure(e);
  }
}
