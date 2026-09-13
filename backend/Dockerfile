# syntax = docker/dockerfile:1
ARG RUBY_VERSION=3.3.5
# docker.io is what Rails 8's own generator picked for this app. The older
# registry.docker.com host works too, but matching the generator means one
# less thing to wonder about when a build fails.
FROM docker.io/library/ruby:$RUBY_VERSION-slim AS base

WORKDIR /rails
ENV RAILS_ENV=production \
    BUNDLE_DEPLOYMENT=1 \
    BUNDLE_PATH=/usr/local/bundle \
    BUNDLE_WITHOUT=development:test

FROM base AS build
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential git libpq-dev pkg-config && \
    rm -rf /var/lib/apt/lists/*

COPY Gemfile Gemfile.lock ./
RUN bundle install && rm -rf ~/.bundle "${BUNDLE_PATH}"/ruby/*/cache

COPY . .
RUN bundle exec bootsnap precompile app/ lib/

FROM base
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl libpq5 && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/local/bundle /usr/local/bundle
COPY --from=build /rails /rails

RUN useradd rails --create-home --shell /bin/bash && chown -R rails:rails /rails db log tmp
USER rails:rails

EXPOSE 3000
CMD ["./bin/rails", "server", "-b", "0.0.0.0"]
