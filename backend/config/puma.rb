# One worker, few threads. There is one coach, one athlete and one viewer.
# Sizing this for concurrency that will never arrive costs memory on a 512MB
# machine that has to boot fast after sleeping.
threads_count = ENV.fetch("RAILS_MAX_THREADS", 3).to_i
threads threads_count, threads_count

port ENV.fetch("PORT", 3000)
environment ENV.fetch("RAILS_ENV", "development")

workers ENV.fetch("WEB_CONCURRENCY", 1).to_i
preload_app!

plugin :tmp_restart
