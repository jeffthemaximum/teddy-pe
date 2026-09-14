module Api
  module V1
    # Base for every v1 endpoint. authorize_request runs before every action
    # unless a controller skips it explicitly.
    class ApiController < ApplicationController
      before_action :authorize_request
      after_action  :touch_last_seen

      attr_reader :current_user

      rescue_from JwtService::InvalidToken,           with: :render_unauthorized
      rescue_from Pundit::NotAuthorizedError,         with: :render_forbidden
      rescue_from ActiveRecord::RecordNotFound,       with: :render_not_found
      rescue_from ActiveRecord::RecordInvalid,        with: :render_unprocessable
      rescue_from ActionController::ParameterMissing, with: :render_bad_request

      # One write per session's worth of polling rather than hundreds.
      LAST_SEEN_THROTTLE = 15.minutes

      private

      def authorize_request
        token = bearer_token
        return render_unauthorized unless token

        payload = JwtService.decode(token)
        @current_user = User.find_by(id: payload[:sub])
        return render_unauthorized unless @current_user

        # Keep this guard last. It refuses by rendering rather than by
        # returning, so anything written below it would still run on a token
        # this rejected.
        render_unauthorized if stale_fingerprint?(payload)
      end

      # A token minted before a password change carries the old digest's
      # fingerprint, so it stops working instead of lasting its full 90 days.
      # A token with no pwd claim has nothing to compare and is left alone.
      def stale_fingerprint?(payload)
        return false if payload[:pwd].blank?
        payload[:pwd] != JwtService.fingerprint(@current_user.password_digest)
      end

      # Which child this request is about.
      #
      # One athlete today. The schema allows a second, and when there is one no
      # endpoint can guess which child a coach means, so this says nothing
      # rather than serving the wrong one. /progression used to take
      # Athlete.first, and its policy never looks at the record, so a second
      # child's rank history, battery and height would have gone to anyone
      # signed in. Both callers share this now so they cannot answer
      # differently.
      def athlete_for(user)
        return user.athlete if user&.athlete
        athletes = Athlete.order(:id).to_a
        athletes.one? ? athletes.first : nil
      end

      def bearer_token
        header = request.headers["Authorization"].to_s
        header.start_with?("Bearer ") ? header.split(" ", 2).last.presence : nil
      end

      def touch_last_seen
        return if current_user.nil?
        last = current_user.last_seen_at
        return if last.present? && last > LAST_SEEN_THROTTLE.ago
        current_user.update_column(:last_seen_at, Time.current)
      rescue StandardError => e
        # Never fail a real request over a bookkeeping write.
        Rails.logger.warn("[api] last_seen_at failed for user=#{current_user&.id}: #{e.message}")
      end

      def render_error(code, message, status)
        render json: { error: { code: code, message: message } }, status: status
      end

      def render_unauthorized(_e = nil) = render_error("unauthorized", "Invalid or missing token.", :unauthorized)
      def render_forbidden(_e = nil)    = render_error("forbidden", "You do not have access to that.", :forbidden)
      def render_not_found(_e = nil)    = render_error("not_found", "Not found.", :not_found)
      def render_unprocessable(e)       = render_error("unprocessable", e.record.errors.full_messages.join(", "), :unprocessable_entity)
      def render_bad_request(e)         = render_error("bad_request", e.message, :bad_request)
    end
  end
end
