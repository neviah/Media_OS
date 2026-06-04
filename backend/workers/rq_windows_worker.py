from __future__ import annotations

import os

from redis import Redis
from rq import Queue
from rq.timeouts import TimerDeathPenalty
from rq.worker import SimpleWorker


def main() -> None:
    redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
    queue_name = os.getenv("MEDIAOS_PUBLISH_QUEUE_NAME", "mediaos-publish")

    connection = Redis.from_url(redis_url)
    queue = Queue(queue_name, connection=connection)

    worker = SimpleWorker([queue], connection=connection)
    worker.death_penalty_class = TimerDeathPenalty
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
