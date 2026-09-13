module Api
  module V1
    class DrillsController < ApiController
      # GET /api/v1/drills
      def index
        authorize Drill
        drills = policy_scope(Drill).alphabetical
        render json: { drills: ActiveModelSerializers::SerializableResource.new(drills).as_json }
      end

      # GET /api/v1/drills/:slug
      def show
        drill = policy_scope(Drill).find_by!(slug: params[:slug])
        authorize drill
        render json: { drill: DrillSerializer.new(drill).as_json }
      end
    end
  end
end
