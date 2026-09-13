# The toggle lives here rather than in the client. An entry Teddy has not
# shared is absent from the coach's payload, not present and hidden.
class AthleteEntryPolicy < ApplicationPolicy
  def index?  = user.coach? || user.athlete?
  def show?   = Scope.new(user, AthleteEntry).resolve.exists?(id: record.id)
  def create? = user.athlete?
  def update? = user.athlete? && record.user_id == user.id

  class Scope < Scope
    def resolve
      return scope.none if user.nil?
      return scope.where(user_id: user.id) if user.athlete?
      return scope.shared_with_coach if user.coach?
      scope.none   # a viewer sees no journal entries from either side
    end
  end
end
